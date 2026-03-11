import type { JsonRpcMetadata } from "./jsonrpc-metadata";
import { readJsonRpcMetadata } from "./jsonrpc-metadata";

type UsageMeteringRouteFlags = {
	isMcpRoute: boolean;
	isTurnsApiRoute: boolean;
	isInitBootstrapApiRoute: boolean;
	isWorldTickApiRoute: boolean;
};

export async function resolveUsageMetering(
	request: Request,
	flags: UsageMeteringRouteFlags,
): Promise<{
	units: number;
	metadata: JsonRpcMetadata | null;
}> {
	const isMeteredRoute =
		request.method === "POST" &&
		(flags.isMcpRoute ||
			flags.isTurnsApiRoute ||
			flags.isInitBootstrapApiRoute ||
			flags.isWorldTickApiRoute);
	if (!isMeteredRoute) {
		return { units: 0, metadata: null };
	}

	if (!flags.isMcpRoute) {
		return { units: 0, metadata: null };
	}

	const metadata = await readJsonRpcMetadata(request);
	return {
		units: metadata.toolCalls.length,
		metadata,
	};
}
