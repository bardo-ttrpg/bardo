export type FeatureFlags = {
	guidedSetupEnabled: boolean;
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
	return {
		guidedSetupEnabled: parseBoolean(env.BARDO_GUIDED_SETUP_ENABLED, true),
	};
}

export const FEATURE_FLAGS = resolveFeatureFlags(Bun.env);
