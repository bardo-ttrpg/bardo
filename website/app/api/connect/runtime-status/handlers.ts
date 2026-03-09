import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { mcpPeriodLimitForPlan } from "../../../../lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "../../../../lib/clerk-live-billing";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../lib/connect-telemetry";
import type { PlanTier } from "../../../../lib/user-billing";

export const runtime = "nodejs";

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

type RuntimeStatusDeps = {
	createClerkClient: () => Promise<ClerkLikeClient>;
	resolvePlanForSubject: (
		clerk: ClerkLikeClient,
		subject: string,
	) => Promise<{ plan: PlanTier | null; billingUnavailable: boolean }>;
	mcpPeriodLimitResolver: (plan: PlanTier) => number;
	telemetry: ConnectTelemetry;
};

function readApiKey(request: Request): string | null {
	const apiKey = request.headers.get("BARDO_API_KEY")?.trim();
	if (apiKey) {
		return apiKey;
	}

	const authorization = request.headers.get("authorization")?.trim();
	if (!authorization?.startsWith("Bearer ")) {
		return null;
	}

	return authorization.slice("Bearer ".length).trim() || null;
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
	for (const candidate of ["subject", "sub", "userId", "user_id"]) {
		const value = claims[candidate];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function extractWorkspacePath(
	clerkKey: Record<string, unknown>,
): string | null {
	const claims =
		typeof clerkKey.claims === "object" && clerkKey.claims !== null
			? (clerkKey.claims as Record<string, unknown>)
			: {};
	return typeof claims.workspacePath === "string" ? claims.workspacePath : null;
}

function extractScopes(clerkKey: VerifiedKeyRecord): string[] {
	return Array.isArray(clerkKey.scopes)
		? clerkKey.scopes.filter(
				(scope): scope is string =>
					typeof scope === "string" && scope.trim().length > 0,
			)
		: [];
}

function extractErrorStatus(error: unknown): number | null {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status?: unknown }).status === "number"
	) {
		const status = (error as { status: number }).status;
		if (status >= 400 && status <= 599) {
			return status;
		}
	}
	return null;
}

const defaultDeps: RuntimeStatusDeps = {
	createClerkClient: async () =>
		(await clerkClient()) as unknown as ClerkLikeClient,
	resolvePlanForSubject: async (clerk, subject) => {
		const live = await fetchLiveBillingSnapshotFromClerk(
			clerk as never,
			subject,
		);
		return live.billingUnavailable
			? { plan: null, billingUnavailable: true }
			: { plan: live.plan, billingUnavailable: false };
	},
	mcpPeriodLimitResolver: (plan) => mcpPeriodLimitForPlan(plan),
	telemetry: getDefaultConnectTelemetry(),
};

export function createRuntimeStatusGetHandler(
	overrides: Partial<RuntimeStatusDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function GET(request: Request) {
		const apiKey = readApiKey(request);
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Missing API key. Send Authorization: Bearer <key>." },
				{ status: 401 },
			);
		}

		try {
			const clerk = await deps.createClerkClient();
			const verifiedKey: VerifiedKeyRecord = await clerk.apiKeys.verify(apiKey);
			const subjectId = extractSubjectFromVerifiedKey(
				verifiedKey as Record<string, unknown>,
			);
			const { plan, billingUnavailable } = subjectId
				? await deps.resolvePlanForSubject(clerk, subjectId)
				: { plan: null, billingUnavailable: false };
			deps.telemetry.increment("runtime_status_success");

			return NextResponse.json({
				valid: true,
				subjectId,
				keyId: typeof verifiedKey.id === "string" ? verifiedKey.id : null,
				scopes: extractScopes(verifiedKey),
				workspacePath: extractWorkspacePath(
					verifiedKey as Record<string, unknown>,
				),
				plan,
				mcpPeriodLimit:
					plan && !billingUnavailable
						? deps.mcpPeriodLimitResolver(plan)
						: null,
				billingUnavailable,
			});
		} catch (error) {
			const status = extractErrorStatus(error);
			if (status === 401 || status === 403) {
				deps.telemetry.increment("runtime_status_invalid");
				return NextResponse.json(
					{ error: "Invalid API key." },
					{ status: status ?? 401 },
				);
			}
			deps.telemetry.increment("runtime_status_failed");
			return NextResponse.json(
				{
					error:
						error instanceof Error ? error.message : "Runtime status failed.",
				},
				{ status: 500 },
			);
		}
	};
}

export const GET = createRuntimeStatusGetHandler();
