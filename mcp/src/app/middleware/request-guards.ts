export function isRequestPayloadTooLarge(
	request: Request,
	maxRequestBytes: number,
): boolean {
	if (maxRequestBytes <= 0) return false;

	const contentLengthHeader = request.headers.get("content-length");
	if (!contentLengthHeader) return false;

	const contentLength = Number(contentLengthHeader);
	if (!Number.isFinite(contentLength) || contentLength < 0) {
		return false;
	}

	return contentLength > maxRequestBytes;
}

export function getRateLimitKey(
	request: Request,
	apiKey: string | null,
): string {
	if (apiKey) return `api:${apiKey}`;

	const forwardedFor = request.headers.get("x-forwarded-for");
	const ip = forwardedFor?.split(",")[0]?.trim();
	if (ip) return `ip:${ip}`;

	return "anonymous";
}
