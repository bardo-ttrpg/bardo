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
	const envBase =
		process.env.BARDO_MCP_BASE_URL?.trim() ||
		process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim();
	if (envBase) return new URL("/mcp", envBase).toString();

	const requestUrl = new URL(request.url);
	if (
		requestUrl.protocol === "http:" &&
		(requestUrl.hostname === "localhost" ||
			requestUrl.hostname === "127.0.0.1") &&
		requestUrl.port === "3001"
	) {
		return `${requestUrl.protocol}//${requestUrl.hostname}:3000/mcp`;
	}

	const protocol = requestUrl.protocol === "http:" ? "http:" : "https:";
	return `${protocol}//${requestUrl.host}/mcp`;
}

type SnippetRequest = {
	client: string | null;
	mode: string | null;
	apiKey: string;
	serverName: string;
};

function buildSnippetResponse(request: Request, params: SnippetRequest) {
	const { client, mode, apiKey, serverName } = params;

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

export async function GET(request: Request) {
	const url = new URL(request.url);
	return buildSnippetResponse(request, {
		client: url.searchParams.get("client"),
		mode: url.searchParams.get("mode"),
		apiKey: url.searchParams.get("apiKey") || "YOUR_API_KEY",
		serverName: url.searchParams.get("serverName") || "bardo",
	});
}

export async function POST(request: Request) {
	const body = (await request.json().catch(() => ({}))) as Partial<{
		client: string;
		mode: string;
		apiKey: string;
		serverName: string;
	}>;

	return buildSnippetResponse(request, {
		client: body.client ?? null,
		mode: body.mode ?? null,
		apiKey:
			typeof body.apiKey === "string" && body.apiKey.trim().length > 0
				? body.apiKey
				: "YOUR_API_KEY",
		serverName:
			typeof body.serverName === "string" && body.serverName.trim().length > 0
				? body.serverName
				: "bardo",
	});
}
