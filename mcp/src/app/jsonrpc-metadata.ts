export type JsonRpcMetadata = {
	method: string;
	toolName: string | null;
	toolArgsHash: string | null;
	toolCalls: Array<{
		toolName: string;
		toolArgsHash: string;
	}>;
};

function stableSerialize(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
	}

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
		.join(",")}}`;
}

function hashText(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseToolCallMetadata(payload: unknown): {
	toolName: string;
	toolArgsHash: string;
} | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const methodValue =
		typeof (payload as { method?: unknown }).method === "string"
			? (payload as { method: string }).method
			: "unknown";
	if (methodValue !== "tools/call") {
		return null;
	}
	const params = (payload as { params?: unknown }).params;
	if (typeof params !== "object" || params === null) {
		return null;
	}
	const paramsRecord = params as { name?: unknown; arguments?: unknown };
	if (
		typeof paramsRecord.name !== "string" ||
		paramsRecord.name.trim().length < 1
	) {
		return null;
	}
	return {
		toolName: paramsRecord.name.trim(),
		toolArgsHash:
			paramsRecord.arguments !== undefined
				? hashText(stableSerialize(paramsRecord.arguments))
				: hashText("{}"),
	};
}

export function parseJsonRpcMetadata(payload: unknown): JsonRpcMetadata {
	if (Array.isArray(payload)) {
		const toolCalls = payload
			.map((item) => parseToolCallMetadata(item))
			.filter(
				(value): value is { toolName: string; toolArgsHash: string } =>
					value !== null,
			);
		return {
			method: "batch",
			toolName: null,
			toolArgsHash: null,
			toolCalls,
		};
	}

	if (typeof payload !== "object" || payload === null) {
		return {
			method: "unknown",
			toolName: null,
			toolArgsHash: null,
			toolCalls: [],
		};
	}

	const methodValue =
		typeof (payload as { method?: unknown }).method === "string"
			? (payload as { method: string }).method
			: "unknown";
	const toolCall = parseToolCallMetadata(payload);

	return {
		method: methodValue,
		toolName: toolCall?.toolName ?? null,
		toolArgsHash: toolCall?.toolArgsHash ?? null,
		toolCalls: toolCall ? [toolCall] : [],
	};
}

export async function readJsonRpcMetadata(
	request: Request,
): Promise<JsonRpcMetadata> {
	try {
		const payload = await request.clone().json();
		return parseJsonRpcMetadata(payload);
	} catch {
		return {
			method: "unknown",
			toolName: null,
			toolArgsHash: null,
			toolCalls: [],
		};
	}
}
