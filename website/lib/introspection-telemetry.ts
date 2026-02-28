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

	function increment(name: IntrospectionCounterName): void {
		counters.set(name, (counters.get(name) ?? 0) + 1);
		totalIncrements += 1;
		if (logEnabled && totalIncrements % logEvery === 0) {
			console.info("[introspection-telemetry]", snapshot());
		}
	}

	function snapshot(): Record<string, number> {
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
