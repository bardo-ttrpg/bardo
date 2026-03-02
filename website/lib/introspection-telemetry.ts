type IntrospectionCounterName =
	| "cache_hit_valid"
	| "cache_hit_invalid"
	| "clerk_verify_called"
	| "clerk_verify_invalid"
	| "budget_block_user"
	| "budget_block_key"
	| "success";

type IntrospectionTelemetryOptions = {
	logEnabled?: boolean;
	logEvery?: number;
	logger?: {
		info: (
			message: string,
			attributes?: Record<string, string | number | boolean>,
		) => void;
	};
};

type IntrospectionTelemetrySnapshot = {
	cache_hit_valid: number;
	cache_hit_invalid: number;
	clerk_verify_called: number;
	clerk_verify_invalid: number;
	budget_block_user: number;
	budget_block_key: number;
	success: number;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return fallback;
	}
	return Math.floor(parsed);
}

export function createIntrospectionTelemetry(
	options: IntrospectionTelemetryOptions = {},
) {
	const counters = new Map<IntrospectionCounterName, number>();
	const logger = options.logger;
	const logEnabled =
		options.logEnabled ??
		parseBoolean(process.env.BARDO_INTROSPECTION_TELEMETRY_LOG, false);
	const logEvery =
		options.logEvery ??
		parsePositiveInteger(
			process.env.BARDO_INTROSPECTION_TELEMETRY_LOG_EVERY,
			100,
		);
	let totalIncrements = 0;

	function snapshot(): IntrospectionTelemetrySnapshot {
		return {
			cache_hit_valid: counters.get("cache_hit_valid") ?? 0,
			cache_hit_invalid: counters.get("cache_hit_invalid") ?? 0,
			clerk_verify_called: counters.get("clerk_verify_called") ?? 0,
			clerk_verify_invalid: counters.get("clerk_verify_invalid") ?? 0,
			budget_block_user: counters.get("budget_block_user") ?? 0,
			budget_block_key: counters.get("budget_block_key") ?? 0,
			success: counters.get("success") ?? 0,
		};
	}

	function increment(name: IntrospectionCounterName): void {
		counters.set(name, (counters.get(name) ?? 0) + 1);
		totalIncrements += 1;
		if (logEnabled && totalIncrements % logEvery === 0) {
			const currentSnapshot = snapshot();
			logger?.info("bardo.introspection.telemetry_snapshot", {
				"bardo.service": "website",
				"bardo.flow": "auth_introspection",
				"bardo.introspection.cache_hit_valid": currentSnapshot.cache_hit_valid,
				"bardo.introspection.cache_hit_invalid":
					currentSnapshot.cache_hit_invalid,
				"bardo.introspection.clerk_verify_called":
					currentSnapshot.clerk_verify_called,
				"bardo.introspection.clerk_verify_invalid":
					currentSnapshot.clerk_verify_invalid,
				"bardo.introspection.budget_block_user":
					currentSnapshot.budget_block_user,
				"bardo.introspection.budget_block_key":
					currentSnapshot.budget_block_key,
				"bardo.introspection.success": currentSnapshot.success,
			});
		}
	}

	function reset(): void {
		counters.clear();
		totalIncrements = 0;
	}

	return {
		increment,
		snapshot,
		reset,
	};
}

export type IntrospectionTelemetry = ReturnType<
	typeof createIntrospectionTelemetry
>;
