import type { IntrospectionTelemetry } from "./introspection-telemetry";
import type { PlanTier } from "./user-billing";

type SpanAttributeValue = string | number | boolean;

type SpanLike = {
	setAttribute(name: string, value: SpanAttributeValue): void;
};

type SpanAttributes = Record<string, SpanAttributeValue>;

type IntrospectionSpanResult =
	| "success"
	| "invalid"
	| "blocked"
	| "unauthorized"
	| "error";

type IntrospectionTelemetrySnapshot = ReturnType<
	IntrospectionTelemetry["snapshot"]
>;

type IntrospectionSpanAttributesArgs = {
	requiredScope: string;
	workspaceOverrideRequested: boolean;
	result: IntrospectionSpanResult;
	cachedVerification: boolean;
	preAuthBackend?: "memory" | "website" | null;
	userBudgetBackend?: "memory" | "website" | null;
	keyBudgetBackend?: "memory" | "website" | null;
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

function createNoopSpan(): SpanLike {
	return {
		setAttribute() {},
	};
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

export function createIntrospectionTracing() {
	function log(
		level: "info" | "warn" | "error",
		message: string,
		attributes: Record<string, SpanAttributeValue | null | undefined> = {},
	): void {
		const payload = compactAttributes({
			"bardo.service": "website",
			"bardo.flow": "auth_introspection",
			...attributes,
		});
		if (level === "error") {
			console.error(message, payload);
			return;
		}
		if (level === "warn") {
			console.warn(message, payload);
			return;
		}
		console.info(message, payload);
	}

	return {
		withRequestSpan<T>(
			_args: {
				requiredScope: string;
				workspaceOverrideRequested: boolean;
			},
			callback: (span: SpanLike) => T,
		): T {
			return callback(createNoopSpan());
		},
		withClerkVerifySpan<T>(callback: () => T): T {
			return callback();
		},
		withPlanLookupSpan<T>(callback: () => T): T {
			return callback();
		},
		captureException(error: unknown): void {
			console.error("bardo.auth_introspection.exception", error);
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
