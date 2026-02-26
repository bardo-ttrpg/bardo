import { NextResponse } from "next/server";
import {
	buildConnectionSnippet,
	type ConnectionClient,
	type ConnectionMode,
	SUPPORTED_CONNECTION_CLIENTS,
} from "@/lib/connect-snippets";

function isConnectionMode(value: string | null): value is ConnectionMode {
	return value === "remote" || value === "local";
}

function isConnectionClient(value: string | null): value is ConnectionClient {
	return (
		typeof value === "string" &&
		(SUPPORTED_CONNECTION_CLIENTS as readonly string[]).includes(value)
	);
}

function resolveBaseUrl(request: Request): string {
	const envBase = process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim();
	if (envBase) return new URL("/mcp", envBase).toString();

	const requestUrl = new URL(request.url);
	const protocol = requestUrl.protocol === "http:" ? "http:" : "https:";
	return `${protocol}//${requestUrl.host}/mcp`;
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const client = url.searchParams.get("client");
	const mode = url.searchParams.get("mode");
	const apiKey = url.searchParams.get("apiKey") || "YOUR_API_KEY";
	const serverName = url.searchParams.get("serverName") || "bardo";

	if (!isConnectionClient(client)) {
		return NextResponse.json(
			{
				error: "Invalid client.",
				supportedClients: SUPPORTED_CONNECTION_CLIENTS,
			},
			{ status: 400 },
		);
	}

	if (!isConnectionMode(mode)) {
		return NextResponse.json(
			{
				error: "Invalid mode. Use remote or local.",
			},
			{ status: 400 },
		);
	}

	const baseUrl = resolveBaseUrl(request);
	const snippet = buildConnectionSnippet({
		client,
		mode,
		baseUrl,
		apiKey,
		serverName,
	});

	return NextResponse.json({
		client,
		mode,
		baseUrl,
		snippet,
	});
}
