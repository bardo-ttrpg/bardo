export function appendVercelProtectionBypass(
	url: string,
	bypassSecret: string,
): string {
	const secret = bypassSecret.trim();
	if (!secret) {
		return url;
	}

	const nextUrl = new URL(url);
	nextUrl.searchParams.set("x-vercel-protection-bypass", secret);
	return nextUrl.toString();
}

export function createVercelProtectionHeaders(
	bypassSecret: string,
	options: {
		setCookie?: boolean;
	} = {},
): Record<string, string> {
	const secret = bypassSecret.trim();
	if (!secret) {
		return {};
	}

	const headers: Record<string, string> = {
		"x-vercel-protection-bypass": secret,
	};

	if (options.setCookie) {
		headers["x-vercel-set-bypass-cookie"] = "true";
	}

	return headers;
}

export function parseJsonOrSseJson<T>(body: string): T {
	const trimmed = body.trim();
	if (!trimmed) {
		throw new SyntaxError("Received an empty response body.");
	}

	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		return JSON.parse(trimmed) as T;
	}

	const dataLine = trimmed
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.startsWith("data:"));
	if (!dataLine) {
		throw new SyntaxError("Response was neither JSON nor SSE JSON.");
	}

	const payload = dataLine.slice("data:".length).trim();
	if (!payload) {
		throw new SyntaxError("SSE response did not include a JSON payload.");
	}

	return JSON.parse(payload) as T;
}
