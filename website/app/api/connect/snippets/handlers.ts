import {
	buildConnectionSnippet,
	type ConnectionClient,
	type ConnectionMode,
	SUPPORTED_CONNECTION_CLIENTS,
} from "@bardo/mcp/client-adapters";
import { NextResponse } from "next/server";
import {
	backendAvailabilityPayload,
	isBackendAvailabilityError,
} from "../../../../lib/backend-availability";
import { getDefaultConnectSnippetsRateLimiter } from "../../../../lib/connect-snippets-rate-limit";
import {
	type ConnectTelemetry,
	getDefaultConnectTelemetry,
} from "../../../../lib/connect-telemetry";

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

	if (!client || !mode) {
		return NextResponse.json(
			{
				error: "Missing client or mode.",
				supportedClients: SUPPORTED_CONNECTION_CLIENTS,
			},
			{ status: 400 },
		);
	}

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

type SnippetsPostDeps = {
	consumeSnippetBudget: (
		request: Request,
	) => Promise<{ allowed: boolean; retryAfterSeconds?: number }>;
	telemetry: ConnectTelemetry;
};

const defaultPostDeps: SnippetsPostDeps = {
	consumeSnippetBudget: async (request) =>
		getDefaultConnectSnippetsRateLimiter().consume(request),
	telemetry: getDefaultConnectTelemetry(),
};

export function createSnippetsPostHandler(
	overrides: Partial<SnippetsPostDeps> = {},
) {
	const deps = { ...defaultPostDeps, ...overrides };

	return async function POST(request: Request) {
		try {
			const budget = await deps.consumeSnippetBudget(request);
			if (!budget.allowed) {
				deps.telemetry.increment("connect_snippets_rejected");
				return NextResponse.json(
					{
						error: "Too many snippet requests. Wait before trying again.",
					},
					{
						status: 429,
						headers:
							typeof budget.retryAfterSeconds === "number"
								? {
										"retry-after": String(budget.retryAfterSeconds),
									}
								: undefined,
					},
				);
			}

			const body = (await request.json().catch(() => ({}))) as Partial<{
				client: string;
				mode: string;
				apiKey: string;
				serverName: string;
			}>;

			const response = buildSnippetResponse(request, {
				client: body.client ?? null,
				mode: body.mode ?? null,
				apiKey:
					typeof body.apiKey === "string" && body.apiKey.trim().length > 0
						? body.apiKey
						: "YOUR_API_KEY",
				serverName:
					typeof body.serverName === "string" &&
					body.serverName.trim().length > 0
						? body.serverName
						: "bardo",
			});

			if (response.status >= 500) {
				deps.telemetry.increment("connect_snippets_failed");
			} else if (response.status >= 400) {
				deps.telemetry.increment("connect_snippets_rejected");
			} else {
				deps.telemetry.increment("connect_snippets_success");
			}
			return response;
		} catch (error) {
			deps.telemetry.increment("connect_snippets_failed");
			if (isBackendAvailabilityError(error)) {
				return NextResponse.json(backendAvailabilityPayload(error), {
					status: 503,
				});
			}
			return NextResponse.json(
				{
					error: error instanceof Error ? error.message : String(error),
				},
				{ status: 500 },
			);
		}
	};
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	if (url.searchParams.has("apiKey")) {
		return NextResponse.json(
			{
				error:
					"Do not pass apiKey in query params. Use POST /api/connect/snippets for secrets.",
			},
			{ status: 400 },
		);
	}
	return buildSnippetResponse(request, {
		client: url.searchParams.get("client"),
		mode: url.searchParams.get("mode"),
		apiKey: "YOUR_API_KEY",
		serverName: url.searchParams.get("serverName") || "bardo",
	});
}

export const POST = createSnippetsPostHandler();
