export function corsHeaders(): Record<string, string> {
	return {
		"access-control-allow-origin": "*",
		"access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
		"access-control-allow-headers":
			"content-type, authorization, x-api-key, bardo_api_key, mcp-session-id, mcp-protocol-version, last-event-id",
		"access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
	};
}

export function withCors(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(corsHeaders())) {
		headers.set(key, value);
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function jsonRpcError(
	status: number,
	code: number,
	message: string,
): Response {
	return new Response(
		JSON.stringify({
			jsonrpc: "2.0",
			error: { code, message },
			id: null,
		}),
		{
			status,
			headers: {
				"content-type": "application/json",
				...corsHeaders(),
			},
		},
	);
}
