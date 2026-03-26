import type { JsonRpcMetadata } from "./jsonrpc-metadata";
import { readJsonRpcMetadata } from "./jsonrpc-metadata";

type UsageMeteringRouteFlags = {
	isMcpRoute: boolean;
	isTurnsApiRoute: boolean;
	isInitBootstrapApiRoute: boolean;
	isWorldTickApiRoute: boolean;
};

function hashText(input: string): string {
	let hash = 2166136261;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function resolveUsageMetering(
	request: Request,
	flags: UsageMeteringRouteFlags,
): Promise<{
	units: number;
	metadata: JsonRpcMetadata | null;
	requestHash: string | null;
}> {
	const isMeteredRoute =
		request.method === "POST" &&
		(flags.isMcpRoute ||
			flags.isTurnsApiRoute ||
			flags.isInitBootstrapApiRoute ||
			flags.isWorldTickApiRoute);
	if (!isMeteredRoute) {
		return { units: 0, metadata: null, requestHash: null };
	}

	if (!flags.isMcpRoute) {
		return { units: 0, metadata: null, requestHash: null };
	}

	const [metadata, requestBody] = await Promise.all([
		readJsonRpcMetadata(request),
		request
			.clone()
			.text()
			.catch(() => ""),
	]);
	return {
		units: metadata.toolCalls.length,
		metadata,
		requestHash: hashText(requestBody),
	};
}
