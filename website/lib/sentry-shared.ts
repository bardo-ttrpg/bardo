type SharedSentryEnv = Partial<
	Record<
		| "NODE_ENV"
		| "SENTRY_TRACES_SAMPLE_RATE"
		| "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
		string | undefined
	>
>;

export function normalizeString(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

export function parseSampleRate(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		return fallback;
	}
	return parsed;
}

export function defaultSampleRate(nodeEnv: string | undefined): number {
	return nodeEnv === "production" ? 0.1 : 1;
}

export type { SharedSentryEnv };
