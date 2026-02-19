export function makeToolResult<T>(payload: T, isError = false) {
	return {
		isError,
		content: [
			{ type: "text" as const, text: JSON.stringify(payload, null, 2) },
		],
		structuredContent: payload,
	};
}
