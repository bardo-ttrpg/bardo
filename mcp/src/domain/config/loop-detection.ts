export type LoopDetectionPolicy = {
	enabled: boolean;
	historySize: number;
	warningThreshold: number;
	criticalThreshold: number;
	globalCircuitBreakerThreshold: number;
};

const DEFAULTS = {
	enabled: true,
	historySize: 30,
	warningThreshold: 10,
	criticalThreshold: 20,
	globalCircuitBreakerThreshold: 30,
} as const;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
	return Math.floor(parsed);
}

export function resolveLoopDetectionPolicy(
	env: Record<string, string | undefined>,
): LoopDetectionPolicy {
	return {
		enabled: parseBoolean(env.BARDO_LOOP_DETECTION_ENABLED, DEFAULTS.enabled),
		historySize: parsePositiveInt(
			env.BARDO_LOOP_HISTORY_SIZE,
			DEFAULTS.historySize,
		),
		warningThreshold: parsePositiveInt(
			env.BARDO_LOOP_WARNING_THRESHOLD,
			DEFAULTS.warningThreshold,
		),
		criticalThreshold: parsePositiveInt(
			env.BARDO_LOOP_CRITICAL_THRESHOLD,
			DEFAULTS.criticalThreshold,
		),
		globalCircuitBreakerThreshold: parsePositiveInt(
			env.BARDO_LOOP_GLOBAL_CIRCUIT_BREAKER_THRESHOLD,
			DEFAULTS.globalCircuitBreakerThreshold,
		),
	};
}

export function validateLoopDetectionPolicy(policy: LoopDetectionPolicy): void {
	if (policy.warningThreshold >= policy.criticalThreshold) {
		throw new Error(
			"Loop detection policy invalid: warningThreshold must be lower than criticalThreshold.",
		);
	}
	if (policy.criticalThreshold >= policy.globalCircuitBreakerThreshold) {
		throw new Error(
			"Loop detection policy invalid: criticalThreshold must be lower than globalCircuitBreakerThreshold.",
		);
	}
	if (policy.historySize < policy.globalCircuitBreakerThreshold) {
		throw new Error(
			"Loop detection policy invalid: historySize must be >= globalCircuitBreakerThreshold.",
		);
	}
}

export const LOOP_DETECTION_POLICY = resolveLoopDetectionPolicy(Bun.env);
