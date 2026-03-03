import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveRouteUserId } from "../../../../lib/clerk-route-auth";
import { createCliLoginTokenCodec } from "../../../../lib/cli-login-token";

export const runtime = "nodejs";

type CreateApiKeyResult = {
	secret: string;
	name: string;
};

type CliTokenRequest = {
	name?: string;
	scopes?: string[];
};

type CliTokenDeps = {
	resolveUserId: (
		request: Request,
	) => Promise<{ userId: string | null; response?: Response }>;
	createApiKey: (args: {
		userId: string;
		name: string;
		scopes: string[];
	}) => Promise<CreateApiKeyResult>;
	createToken: (payload: {
		apiKey: string;
		mcpUrl: string;
		serverName: string;
		issuedAtISO: string;
		expiresAtISO: string;
	}) => Promise<string>;
	resolveMcpUrl: (request: Request) => string;
	exchangeUrl: string | null;
	ttlMs: number;
	now: () => Date;
};

function resolveMcpUrl(request: Request): string {
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

function resolveExchangeUrl(request: Request): string {
	const envValue = process.env.BARDO_CLI_EXCHANGE_URL?.trim();
	if (envValue) {
		return envValue;
	}

	return new URL("/api/connect/cli-exchange", request.url).toString();
}

function parseScopes(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return ["mcp"];
	}
	const scopes = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return scopes.length > 0 ? scopes : ["mcp"];
}

function parseBody(request: Request): Promise<CliTokenRequest> {
	return request
		.json()
		.then((body) => body as CliTokenRequest)
		.catch(() => ({}));
}

function defaultKeyName(now: Date): string {
	return `CLI Login ${now.toISOString()}`;
}

const defaultDeps: CliTokenDeps = {
	resolveUserId: async () => resolveRouteUserId("/api/connect/cli-token"),
	createApiKey: async ({ userId, name, scopes }) => {
		const clerk = await clerkClient();
		const apiKey = await clerk.apiKeys.create({
			name,
			subject: userId,
			scopes,
			claims: { workspacePath: `./customers/${userId}` },
		});
		return {
			secret: apiKey.secret,
			name: apiKey.name,
		};
	},
	createToken: async (payload) => {
		const secret = process.env.BARDO_CLI_LOGIN_SECRET?.trim();
		if (!secret) {
			throw new Error("CLI login exchange is not configured.");
		}
		return createCliLoginTokenCodec(secret).encrypt(payload);
	},
	resolveMcpUrl,
	exchangeUrl: null,
	ttlMs: Number(process.env.BARDO_CLI_LOGIN_TTL_MS ?? 300_000),
	now: () => new Date(),
};

export function createCliTokenPostHandler(
	overrides: Partial<CliTokenDeps> = {},
) {
	const deps = { ...defaultDeps, ...overrides };

	return async function POST(request: Request) {
		const authState = await deps.resolveUserId(request);
		if (authState.response) {
			return authState.response;
		}

		const userId = authState.userId;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		try {
			const body = await parseBody(request);
			const now = deps.now();
			const name = body.name?.trim() || defaultKeyName(now);
			const scopes = parseScopes(body.scopes);
			const key = await deps.createApiKey({ userId, name, scopes });
			const mcpUrl = deps.resolveMcpUrl(request);
			const issuedAtISO = now.toISOString();
			const expiresAtISO = new Date(now.getTime() + deps.ttlMs).toISOString();
			const loginToken = await deps.createToken({
				apiKey: key.secret,
				mcpUrl,
				serverName: "bardo",
				issuedAtISO,
				expiresAtISO,
			});

			return NextResponse.json({
				loginToken,
				exchangeUrl: deps.exchangeUrl ?? resolveExchangeUrl(request),
				mcpUrl,
				serverName: "bardo",
				expiresAtISO,
				keyName: key.name,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return NextResponse.json({ error: message }, { status: 500 });
		}
	};
}

export const POST = createCliTokenPostHandler();
