type RateLimitHeaderValues = {
	retryAfterSeconds?: number;
	limit?: number;
	remaining?: number;
	resetEpochSeconds?: number;
};

function setNumericHeader(
	headers: Headers,
	name: string,
	value: number | undefined,
): void {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		return;
	}
	headers.set(name, String(Math.floor(value)));
}

export function applyRateLimitHeaders(
	headers: Headers,
	values: RateLimitHeaderValues,
): void {
	setNumericHeader(headers, "retry-after", values.retryAfterSeconds);
	setNumericHeader(headers, "x-ratelimit-limit", values.limit);
	setNumericHeader(headers, "x-ratelimit-remaining", values.remaining);
	setNumericHeader(headers, "x-ratelimit-reset", values.resetEpochSeconds);
}
