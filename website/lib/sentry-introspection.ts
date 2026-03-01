import * as Sentry from "@sentry/nextjs";
import type { IntrospectionTelemetry } from "./introspection-telemetry";
import type { PlanTier } from "./user-billing";

type SpanAttributeValue = string | number | boolean;

type SpanLike = {
	setAttribute(name: string, value: SpanAttributeValue): void;
};

type LoggerLike = {
	info(message: string, attributes?: Record<string, SpanAttributeValue>): void;
	warn?(message: string, attributes?: Record<string, SpanAttributeValue>): void;
	error?(
		message: string,
		attributes?: Record<string, SpanAttributeValue>,
	): void;
};

type SentryLike = {
	startSpan<T>(
		options: {
			name: string;
			op: string;
			attributes?: Record<string, SpanAttributeValue>;
		},
		callback: (span: SpanLike) => T,
	): T;
	captureException(error: unknown): string | undefined;
	logger?: LoggerLike;
};

type SpanAttributes = Record<string, SpanAttributeValue>;

export type IntrospectionSpanResult =
	| "success"
	| "invalid"
	| "blocked"
	| "unauthorized"
	| "error";

export type IntrospectionTelemetrySnapshot = ReturnType<
	IntrospectionTelemetry["snapshot"]
>;

export type IntrospectionSpanAttributesArgs = {
	requiredScope: string;
	workspaceOverrideRequested: boolean;
	result: IntrospectionSpanResult;
	cachedVerification: boolean;
	preAuthBackend?: "memory" | "upstash" | null;
	userBudgetBackend?: "memory" | "upstash" | null;
	keyBudgetBackend?: "memory" | "upstash" | null;
	plan?: PlanTier | null;
	telemetrySnapshot: IntrospectionTelemetrySnapshot;
};

export type IntrospectionTracing = ReturnType<
	typeof createIntrospectionTracing
>;

function compactAttributes(
	attributes: Record<string, SpanAttributeValue | null | undefined>,
): SpanAttributes {
	return Object.fromEntries(
		Object.entries(attributes).filter(
			([, value]) => value !== null && value !== undefined,
		),
	) as SpanAttributes;
}

export function applySpanAttributes(
	span: SpanLike,
	attributes: Record<string, SpanAttributeValue | null | undefined>,
): void {
	for (const [key, value] of Object.entries(attributes)) {
		if (value !== null && value !== undefined) {
			span.setAttribute(key, value);
		}
	}
}

export function buildIntrospectionSpanAttributes(
	args: IntrospectionSpanAttributesArgs,
): SpanAttributes {
	return compactAttributes({
		"bardo.service": "website",
		"bardo.flow": "auth_introspection",
		"bardo.required_scope": args.requiredScope,
		"bardo.workspace_override_requested": args.workspaceOverrideRequested,
		"bardo.result": args.result,
		"bardo.introspection.cached_verification": args.cachedVerification,
		"bardo.introspection.pre_auth_backend": args.preAuthBackend,
		"bardo.introspection.user_budget_backend": args.userBudgetBackend,
		"bardo.introspection.key_budget_backend": args.keyBudgetBackend,
		"bardo.introspection.plan": args.plan,
		"bardo.introspection.cache_hit_valid":
			args.telemetrySnapshot.cache_hit_valid,
		"bardo.introspection.cache_hit_invalid":
			args.telemetrySnapshot.cache_hit_invalid,
		"bardo.introspection.clerk_verify_called":
			args.telemetrySnapshot.clerk_verify_called,
		"bardo.introspection.clerk_verify_invalid":
			args.telemetrySnapshot.clerk_verify_invalid,
		"bardo.introspection.budget_block_user":
			args.telemetrySnapshot.budget_block_user,
		"bardo.introspection.budget_block_key":
			args.telemetrySnapshot.budget_block_key,
		"bardo.introspection.success": args.telemetrySnapshot.success,
	});
}

function tracingEnabled(): boolean {
	return Boolean(process.env.SENTRY_DSN?.trim());
}

export function createIntrospectionTracing(
	options: { enabled?: boolean; sdk?: SentryLike } = {},
) {
	const enabled = options.enabled ?? tracingEnabled();
	const sdk = options.sdk ?? (Sentry as unknown as SentryLike);

	function log(
		level: "info" | "warn" | "error",
		message: string,
		attributes: Record<string, SpanAttributeValue | null | undefined> = {},
	): void {
		if (!enabled) {
			return;
		}
		const logger = sdk.logger;
		const method = logger?.[level];
		if (!method) {
			return;
		}
		method.call(
			logger,
			message,
			compactAttributes({
				"bardo.service": "website",
				"bardo.flow": "auth_introspection",
				...attributes,
			}),
		);
	}

	return {
		withRequestSpan<T>(
			args: {
				requiredScope: string;
				workspaceOverrideRequested: boolean;
			},
			callback: (span: SpanLike) => T,
		): T {
			if (!enabled) {
				return callback({
					setAttribute() {},
				});
			}
			return sdk.startSpan(
				{
					name: "POST /api/auth/introspect-key",
					op: "http.server",
					attributes: compactAttributes({
						"bardo.service": "website",
						"bardo.flow": "auth_introspection",
						"bardo.required_scope": args.requiredScope,
						"bardo.workspace_override_requested":
							args.workspaceOverrideRequested,
					}),
				},
				callback,
			);
		},
		withClerkVerifySpan<T>(callback: () => T): T {
			if (!enabled) {
				return callback();
			}
			return sdk.startSpan(
				{
					name: "clerk.apiKeys.verify",
					op: "http.client",
				},
				() => callback(),
			);
		},
		withPlanLookupSpan<T>(callback: () => T): T {
			if (!enabled) {
				return callback();
			}
			return sdk.startSpan(
				{
					name: "clerk.billing.plan_lookup",
					op: "function",
				},
				() => callback(),
			);
		},
		captureException(error: unknown): void {
			if (!enabled) {
				return;
			}
			sdk.captureException(error);
		},
		logInfo(
			message: string,
			attributes: Record<string, SpanAttributeValue | null | undefined> = {},
		): void {
			log("info", message, attributes);
		},
		logWarn(
			message: string,
			attributes: Record<string, SpanAttributeValue | null | undefined> = {},
		): void {
			log("warn", message, attributes);
		},
		logError(
			message: string,
			attributes: Record<string, SpanAttributeValue | null | undefined> = {},
		): void {
			log("error", message, attributes);
		},
	};
}
