import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	createIntrospectionSecretValidator,
	looksLikeClerkApiKey,
	resolveRequestedWorkspaceRoot,
} from "@/lib/api-key-introspection";
import {
	createDailyVerificationBudgetLimiter,
	createSubjectPlanCache,
	type DailyVerificationConsumeResult,
} from "@/lib/api-key-verification-policy";
import { mcpPeriodLimitForPlan } from "@/lib/api-keys";
import { createBillingAdminClient } from "@/lib/billing-admin";
import { decodeBridgeAccessToken } from "@/lib/bridge-session-auth";
import {
	createIntrospectionTelemetry,
	type IntrospectionTelemetry,
} from "@/lib/introspection-telemetry";
import {
	applySpanAttributes,
	buildIntrospectionSpanAttributes,
	createIntrospectionTracing,
	type IntrospectionTracing,
} from "@/lib/introspection-tracing";
import { createIntrospectionVerifyCache } from "@/lib/introspection-verify-cache";
import type { PlanTier } from "@/lib/user-billing";

type IntrospectRequest = {
	apiKey?: string;
	requiredScope?: string;
	providerId?: string;
	modelId?: string;
	workspaceRoot?: string;
};

type VerifiedKeyRecord = {
	id?: string;
	subject?: string;
	claims?: unknown;
	scopes?: unknown;
};

type ClerkApiKeyVerifier = {
	verify(secret: string): Promise<VerifiedKeyRecord>;
};

type ClerkLikeClient = {
	apiKeys: ClerkApiKeyVerifier;
};

type VerificationLimiter = {
	consumePreAuthKey(
		secretHash: string,
		plan?: PlanTier,
	): Promise<DailyVerificationConsumeResult>;
	consumeUser(
		subject: string,
		plan: PlanTier,
	): Promise<DailyVerificationConsumeResult>;
	consumeKey(
		keyId: string,
		plan: PlanTier,
	): Promise<DailyVerificationConsumeResult>;
};

type SubjectPlanCache = {
	resolve(
		subject: string,
		lookup: () => Promise<SubjectPlanResolution>,
	): Promise<SubjectPlanResolution>;
};

type SubjectPlanResolution = {
	plan: PlanTier | null;
	billingUnavailable: boolean;
};

type IntrospectionDeps = {
	introspectionSecret: string | undefined;
	allowWorkspaceRootOverrideEnv: string | undefined;
	workspaceRootAllowlistEnv: string | undefined;
	verificationLimiter: VerificationLimiter;
	subjectPlanCache: SubjectPlanCache;
	introspectionVerifyCache: ReturnType<typeof createIntrospectionVerifyCache>;
	telemetry: IntrospectionTelemetry;
	createClerkClient: () => Promise<ClerkLikeClient>;
	decodeBridgeToken: (token: string) => Promise<{
		sessionId: string;
		userId: string;
		plan: PlanTier;
		accountLabel: string;
	} | null>;
	resolvePlanForSubject: (
		clerk: ClerkLikeClient,
		subject: string,
	) => Promise<SubjectPlanResolution>;
	mcpPeriodLimitResolver: (plan: PlanTier) => number;
	tracing: IntrospectionTracing;
};

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function extractSubjectFromVerifiedKey(
	clerkKey: Record<string, unknown>,
): string | null {
	if (typeof clerkKey.subject === "string" && clerkKey.subject.trim()) {
		return clerkKey.subject.trim();
	}
	const claims =
		typeof clerkKey.claims === "object" && clerkKey.claims !== null
			? (clerkKey.claims as Record<string, unknown>)
			: {};
	const subjectCandidates = ["subject", "sub", "userId", "user_id"];
	for (const candidate of subjectCandidates) {
		const value = claims[candidate];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function extractVerifiedKeyId(
	clerkKey: Record<string, unknown>,
	apiKeySecret: string,
): string {
	if (typeof clerkKey.id === "string" && clerkKey.id.trim()) {
		return clerkKey.id.trim();
	}
	return `ak:${apiKeySecret.slice(0, 16)}`;
}

function extractErrorStatus(error: unknown): number | null {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status?: unknown }).status === "number"
	) {
		const status = (error as { status: number }).status;
		if (status >= 100 && status <= 599) {
			return status;
		}
	}
	return null;
}

function shouldCacheInvalidVerificationError(error: unknown): boolean {
	const status = extractErrorStatus(error);
	return status === 400 || status === 401 || status === 403 || status === 404;
}

async function hashApiKeySecret(secret: string): Promise<string> {
	const encoded = new TextEncoder().encode(secret);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(digest), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

const verificationLimiter = createDailyVerificationBudgetLimiter();
const subjectPlanCache = createSubjectPlanCache<SubjectPlanResolution>({
	ttlMs: parsePositiveInteger(
		process.env.BARDO_INTROSPECTION_PLAN_CACHE_TTL_MS,
		300_000,
	),
});
const introspectionTracing = createIntrospectionTracing();
const introspectionVerifyCache = createIntrospectionVerifyCache({
	validTtlMs: parsePositiveInteger(
		process.env.BARDO_INTROSPECTION_VERIFY_CACHE_TTL_MS,
		120_000,
	),
	invalidTtlMs: parsePositiveInteger(
		process.env.BARDO_INTROSPECTION_INVALID_CACHE_TTL_MS,
		20_000,
	),
});
const introspectionTelemetry = createIntrospectionTelemetry({
	logger: {
		info(message, attributes) {
			introspectionTracing.logInfo(message, attributes);
		},
	},
});

const defaultDeps: IntrospectionDeps = {
	introspectionSecret: process.env.BARDO_AUTH_INTROSPECTION_TOKEN,
	allowWorkspaceRootOverrideEnv:
		process.env.BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE,
	workspaceRootAllowlistEnv: process.env.BARDO_WORKSPACE_ROOT_ALLOWLIST,
	verificationLimiter,
	subjectPlanCache,
	introspectionVerifyCache,
	telemetry: introspectionTelemetry,
	createClerkClient: async () =>
		(await clerkClient()) as unknown as ClerkLikeClient,
	decodeBridgeToken: async (token) => {
		const decoded = await decodeBridgeAccessToken({ token }).catch(() => null);
		if (!decoded) {
			return null;
		}
		return {
			sessionId: decoded.sessionId,
			userId: decoded.userId,
			plan: decoded.plan,
			accountLabel: decoded.accountLabel,
		};
	},
	resolvePlanForSubject: async (_clerk, subject) => {
		const billing =
			await createBillingAdminClient().readBillingSnapshot(subject);
		return billing.billingUnavailable
			? { plan: null, billingUnavailable: true }
			: { plan: billing.plan, billingUnavailable: false };
	},
	mcpPeriodLimitResolver: (plan) => mcpPeriodLimitForPlan(plan),
	tracing: introspectionTracing,
};

export function createIntrospectPostHandler(
	overrides: Partial<IntrospectionDeps> = {},
) {
	const deps: IntrospectionDeps = {
		...defaultDeps,
		...overrides,
	};

	return async function post(request: Request) {
		const authorize = createIntrospectionSecretValidator(
			deps.introspectionSecret,
		);
		let body: IntrospectRequest = {};
		let secret: string | undefined;
		let requiredScope = "mcp";
		let workspaceOverrideRequested = false;
		let requestedWorkspaceRoot: string | null = null;

		return await deps.tracing.withRequestSpan(
			{
				requiredScope,
				workspaceOverrideRequested,
			},
			async (span) => {
				function finalize(
					response: NextResponse,
					args: {
						result:
							| "success"
							| "invalid"
							| "blocked"
							| "unauthorized"
							| "error";
						cachedVerification: boolean;
						preAuthBackend?: "memory" | "website" | null;
						userBudgetBackend?: "memory" | "website" | null;
						keyBudgetBackend?: "memory" | "website" | null;
						plan?: PlanTier | null;
					},
				): NextResponse {
					applySpanAttributes(
						span,
						buildIntrospectionSpanAttributes({
							requiredScope,
							workspaceOverrideRequested,
							result: args.result,
							cachedVerification: args.cachedVerification,
							preAuthBackend: args.preAuthBackend,
							userBudgetBackend: args.userBudgetBackend,
							keyBudgetBackend: args.keyBudgetBackend,
							plan: args.plan,
							telemetrySnapshot: deps.telemetry.snapshot(),
						}),
					);
					return response;
				}

				if (!authorize(request.headers)) {
					deps.tracing.logWarn("bardo.auth_introspection.unauthorized", {
						"bardo.required_scope": requiredScope,
						"bardo.workspace_override_requested": workspaceOverrideRequested,
					});
					return finalize(
						NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
						{
							result: "unauthorized",
							cachedVerification: false,
						},
					);
				}

				try {
					body = (await request.json()) as IntrospectRequest;
				} catch {
					body = {};
				}

				secret = body.apiKey?.trim();
				requiredScope = body.requiredScope?.trim() || "mcp";
				workspaceOverrideRequested =
					typeof body.workspaceRoot === "string" &&
					body.workspaceRoot.trim().length > 0;
				const bridgeWorkspaceRoot =
					typeof body.workspaceRoot === "string" &&
					body.workspaceRoot.trim().length > 0
						? body.workspaceRoot.trim()
						: null;
				requestedWorkspaceRoot = resolveRequestedWorkspaceRoot({
					rawWorkspaceRoot: body.workspaceRoot,
					allowOverrideEnv: deps.allowWorkspaceRootOverrideEnv,
					allowlistEnv: deps.workspaceRootAllowlistEnv,
				});

				if (!secret) {
					return finalize(
						NextResponse.json({ valid: false }, { status: 200 }),
						{
							result: "invalid",
							cachedVerification: false,
						},
					);
				}
				const apiKeySecret = secret;
				const bridgeToken = await deps.decodeBridgeToken(apiKeySecret);
				if (bridgeToken) {
					if (!bridgeWorkspaceRoot) {
						return finalize(
							NextResponse.json({ valid: false }, { status: 200 }),
							{
								result: "invalid",
								cachedVerification: false,
							},
						);
					}

					const clerk = await deps.createClerkClient();
					const resolvedPlan = await deps.resolvePlanForSubject(
						clerk,
						bridgeToken.userId,
					);
					const plan = resolvedPlan.plan ?? "free";
					if (resolvedPlan.billingUnavailable || plan === "free") {
						return finalize(
							NextResponse.json({ valid: false }, { status: 200 }),
							{
								result: "invalid",
								cachedVerification: false,
								plan,
							},
						);
					}

					const userUsage = await deps.verificationLimiter.consumeUser(
						bridgeToken.userId,
						plan,
					);
					if (!userUsage.allowed) {
						deps.telemetry.increment("budget_block_user");
						return finalize(
							NextResponse.json(
								{
									valid: false,
									reason: "daily_user_verification_limit_reached",
									verification: {
										user: userUsage,
										key: null,
									},
								},
								{ status: 200 },
							),
							{
								result: "blocked",
								cachedVerification: false,
								userBudgetBackend: userUsage.backend,
								plan,
							},
						);
					}

					const keyUsage = await deps.verificationLimiter.consumeKey(
						`bridge:${bridgeToken.sessionId}`,
						plan,
					);
					if (!keyUsage.allowed) {
						deps.telemetry.increment("budget_block_key");
						return finalize(
							NextResponse.json(
								{
									valid: false,
									reason: "daily_key_verification_limit_reached",
									verification: {
										user: userUsage,
										key: keyUsage,
									},
								},
								{ status: 200 },
							),
							{
								result: "blocked",
								cachedVerification: false,
								userBudgetBackend: userUsage.backend,
								keyBudgetBackend: keyUsage.backend,
								plan,
							},
						);
					}

					deps.telemetry.increment("success");
					return finalize(
						NextResponse.json({
							valid: true,
							campaignBasePath: bridgeWorkspaceRoot,
							keyPrefix: `bridge:${bridgeToken.sessionId}`.slice(0, 15),
							subjectId: bridgeToken.userId,
							keyId: `bridge:${bridgeToken.sessionId}`,
							plan,
							billingUnavailable: false,
							mcpPeriodLimit: deps.mcpPeriodLimitResolver(plan),
							verification: {
								user: userUsage,
								key: keyUsage,
							},
						}),
						{
							result: "success",
							cachedVerification: false,
							userBudgetBackend: userUsage.backend,
							keyBudgetBackend: keyUsage.backend,
							plan,
						},
					);
				}

				const cachedVerification =
					deps.introspectionVerifyCache.get(apiKeySecret);
				if (cachedVerification?.kind === "invalid") {
					deps.telemetry.increment("cache_hit_invalid");
					return finalize(
						NextResponse.json(
							{ valid: false, reason: "cached_invalid_api_key" },
							{ status: 200 },
						),
						{
							result: "invalid",
							cachedVerification: true,
						},
					);
				}
				if (cachedVerification?.kind === "valid") {
					deps.telemetry.increment("cache_hit_valid");
					if (!cachedVerification.value.scopes.includes(requiredScope)) {
						return finalize(
							NextResponse.json({ valid: false }, { status: 200 }),
							{
								result: "invalid",
								cachedVerification: true,
								plan: cachedVerification.value.plan,
							},
						);
					}
					const campaignBasePath =
						requestedWorkspaceRoot ?? cachedVerification.value.workspacePath;
					if (!campaignBasePath) {
						return finalize(
							NextResponse.json({ valid: false }, { status: 200 }),
							{
								result: "invalid",
								cachedVerification: true,
								plan: cachedVerification.value.plan,
							},
						);
					}
					deps.telemetry.increment("success");
					return finalize(
						NextResponse.json({
							valid: true,
							campaignBasePath,
							keyPrefix: cachedVerification.value.keyId.slice(0, 15),
							subjectId: cachedVerification.value.subjectId,
							keyId: cachedVerification.value.keyId,
							plan: cachedVerification.value.plan,
							billingUnavailable: Boolean(
								cachedVerification.value.billingUnavailable,
							),
							mcpPeriodLimit: deps.mcpPeriodLimitResolver(
								cachedVerification.value.plan,
							),
							verification: {
								cached: true,
								user: null,
								key: null,
							},
						}),
						{
							result: "success",
							cachedVerification: true,
							plan: cachedVerification.value.plan,
						},
					);
				}

				if (!looksLikeClerkApiKey(apiKeySecret)) {
					deps.introspectionVerifyCache.setInvalid(apiKeySecret);
					deps.tracing.logWarn(
						"bardo.auth_introspection.unsupported_key_format",
						{
							"bardo.required_scope": requiredScope,
							"bardo.workspace_override_requested": workspaceOverrideRequested,
							"bardo.result": "invalid",
						},
					);
					return finalize(
						NextResponse.json({ valid: false }, { status: 200 }),
						{
							result: "invalid",
							cachedVerification: false,
						},
					);
				}

				const preliminaryKeyUsage =
					await deps.verificationLimiter.consumePreAuthKey(
						await hashApiKeySecret(apiKeySecret),
						"pro",
					);
				if (!preliminaryKeyUsage.allowed) {
					deps.telemetry.increment("budget_block_key");
					deps.introspectionVerifyCache.setInvalid(apiKeySecret);
					deps.tracing.logWarn("bardo.auth_introspection.pre_auth_blocked", {
						"bardo.required_scope": requiredScope,
						"bardo.workspace_override_requested": workspaceOverrideRequested,
						"bardo.result": "blocked",
						"bardo.introspection.pre_auth_backend": preliminaryKeyUsage.backend,
					});
					return finalize(
						NextResponse.json(
							{
								valid: false,
								reason: "daily_key_verification_limit_reached",
								verification: {
									user: null,
									key: preliminaryKeyUsage,
								},
							},
							{ status: 200 },
						),
						{
							result: "blocked",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
						},
					);
				}

				const clerk = await deps.createClerkClient();
				let clerkKey: VerifiedKeyRecord;
				deps.telemetry.increment("clerk_verify_called");
				try {
					clerkKey = await deps.tracing.withClerkVerifySpan(() =>
						clerk.apiKeys.verify(apiKeySecret),
					);
				} catch (error) {
					deps.telemetry.increment("clerk_verify_invalid");
					if (shouldCacheInvalidVerificationError(error)) {
						deps.introspectionVerifyCache.setInvalid(apiKeySecret);
						deps.tracing.logWarn("bardo.auth_introspection.invalid_key", {
							"bardo.required_scope": requiredScope,
							"bardo.workspace_override_requested": workspaceOverrideRequested,
							"bardo.result": "invalid",
							"http.status_code": extractErrorStatus(error) ?? undefined,
							"bardo.introspection.pre_auth_backend":
								preliminaryKeyUsage.backend,
						});
					} else {
						deps.tracing.captureException(error);
						deps.tracing.logError("bardo.auth_introspection.verify_failed", {
							"bardo.required_scope": requiredScope,
							"bardo.workspace_override_requested": workspaceOverrideRequested,
							"bardo.result": "error",
							"http.status_code": extractErrorStatus(error) ?? undefined,
							"bardo.introspection.pre_auth_backend":
								preliminaryKeyUsage.backend,
						});
					}
					return finalize(
						NextResponse.json({ valid: false }, { status: 200 }),
						{
							result: "invalid",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
						},
					);
				}

				const keyRecord = clerkKey as Record<string, unknown>;
				const subject = extractSubjectFromVerifiedKey(keyRecord);
				const keyId = extractVerifiedKeyId(keyRecord, apiKeySecret);
				const scopes = Array.isArray(clerkKey.scopes)
					? clerkKey.scopes.filter(
							(scope): scope is string =>
								typeof scope === "string" && scope.trim().length > 0,
						)
					: [];
				let plan: PlanTier = "free";
				let billingUnavailable = false;
				if (subject) {
					const cachedPlanResolution = await deps.tracing.withPlanLookupSpan(
						() =>
							deps.subjectPlanCache.resolve(
								subject,
								async () => await deps.resolvePlanForSubject(clerk, subject),
							),
					);
					const resolvedPlan = cachedPlanResolution;
					billingUnavailable = resolvedPlan.billingUnavailable;
					plan = resolvedPlan.plan ?? "free";
				}
				if (!subject || billingUnavailable || plan === "free") {
					deps.introspectionVerifyCache.setInvalid(apiKeySecret);
					return finalize(
						NextResponse.json(
							{
								valid: false,
								reason: "active_pro_subscription_required",
							},
							{ status: 200 },
						),
						{
							result: "invalid",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
							plan,
						},
					);
				}

				const userUsage = subject
					? await deps.verificationLimiter.consumeUser(subject, plan)
					: null;
				if (userUsage && !userUsage.allowed) {
					deps.telemetry.increment("budget_block_user");
					deps.introspectionVerifyCache.setInvalid(apiKeySecret);
					deps.tracing.logWarn("bardo.auth_introspection.user_budget_blocked", {
						"bardo.required_scope": requiredScope,
						"bardo.workspace_override_requested": workspaceOverrideRequested,
						"bardo.result": "blocked",
						"bardo.introspection.pre_auth_backend": preliminaryKeyUsage.backend,
						"bardo.introspection.user_budget_backend": userUsage.backend,
						"bardo.introspection.plan": plan,
					});
					return finalize(
						NextResponse.json(
							{
								valid: false,
								reason: "daily_user_verification_limit_reached",
								verification: {
									user: userUsage,
									key: null,
								},
							},
							{ status: 200 },
						),
						{
							result: "blocked",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
							userBudgetBackend: userUsage.backend,
							plan,
						},
					);
				}

				const keyUsage = await deps.verificationLimiter.consumeKey(keyId, plan);
				if (!keyUsage.allowed) {
					deps.telemetry.increment("budget_block_key");
					deps.introspectionVerifyCache.setInvalid(apiKeySecret);
					deps.tracing.logWarn("bardo.auth_introspection.key_budget_blocked", {
						"bardo.required_scope": requiredScope,
						"bardo.workspace_override_requested": workspaceOverrideRequested,
						"bardo.result": "blocked",
						"bardo.introspection.pre_auth_backend": preliminaryKeyUsage.backend,
						"bardo.introspection.user_budget_backend":
							userUsage?.backend ?? null,
						"bardo.introspection.key_budget_backend": keyUsage.backend,
						"bardo.introspection.plan": plan,
					});
					return finalize(
						NextResponse.json(
							{
								valid: false,
								reason: "daily_key_verification_limit_reached",
								verification: {
									user: userUsage,
									key: keyUsage,
								},
							},
							{ status: 200 },
						),
						{
							result: "blocked",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
							userBudgetBackend: userUsage?.backend ?? null,
							keyBudgetBackend: keyUsage.backend,
							plan,
						},
					);
				}

				const claims =
					typeof clerkKey.claims === "object" && clerkKey.claims !== null
						? (clerkKey.claims as Record<string, unknown>)
						: {};
				const workspacePath =
					typeof claims.workspacePath === "string"
						? claims.workspacePath
						: null;

				deps.introspectionVerifyCache.setValid(apiKeySecret, {
					subjectId: subject,
					keyId,
					plan,
					billingUnavailable,
					scopes,
					workspacePath,
				});

				if (!scopes.includes(requiredScope)) {
					return finalize(
						NextResponse.json({ valid: false }, { status: 200 }),
						{
							result: "invalid",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
							userBudgetBackend: userUsage?.backend ?? null,
							keyBudgetBackend: keyUsage.backend,
							plan,
						},
					);
				}

				if (!workspacePath && !requestedWorkspaceRoot) {
					return finalize(
						NextResponse.json({ valid: false }, { status: 200 }),
						{
							result: "invalid",
							cachedVerification: false,
							preAuthBackend: preliminaryKeyUsage.backend,
							userBudgetBackend: userUsage?.backend ?? null,
							keyBudgetBackend: keyUsage.backend,
							plan,
						},
					);
				}

				deps.telemetry.increment("success");
				return finalize(
					NextResponse.json({
						valid: true,
						campaignBasePath: requestedWorkspaceRoot ?? workspacePath,
						keyPrefix: keyId.slice(0, 15),
						subjectId: subject,
						keyId,
						plan,
						billingUnavailable,
						mcpPeriodLimit: deps.mcpPeriodLimitResolver(plan),
						verification: {
							user: userUsage,
							key: keyUsage,
						},
					}),
					{
						result: "success",
						cachedVerification: false,
						preAuthBackend: preliminaryKeyUsage.backend,
						userBudgetBackend: userUsage?.backend ?? null,
						keyBudgetBackend: keyUsage.backend,
						plan,
					},
				);
			},
		);
	};
}

export const POST = createIntrospectPostHandler();
