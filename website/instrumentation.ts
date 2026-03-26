export async function register() {}

export function onRequestError(error: unknown) {
	console.error("[website] request error", error);
}
