export type FeatureFlags = {
	guidedSetupEnabled: boolean;
	strictCanonicalMode: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

export function resolveFeatureFlags(
	env: Record<string, string | undefined>,
): FeatureFlags {
	const isProduction = env.NODE_ENV === "production";
	return {
		guidedSetupEnabled: parseBoolean(env.BARDO_GUIDED_SETUP_ENABLED, true),
		strictCanonicalMode: parseBoolean(
			env.BARDO_STRICT_CANONICAL_MODE,
			isProduction,
		),
	};
}

export const FEATURE_FLAGS = resolveFeatureFlags(Bun.env);
