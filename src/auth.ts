import path from "node:path";
import { AUTH_BEARER_PREFIX, AUTH_HEADER } from "./config";
import { corsHeaders } from "./http/response";
import type { AuthContext, Session } from "./types";

function tryParseObject(raw: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
		) {
			return parsed as Record<string, unknown>;
		}
		return null;
	} catch {
		return null;
	}
}

function parseApiKeyMapFromEnv(): Map<string, string> {
	const raw = Bun.env.BARDO_API_KEYS_JSON?.trim();
	if (!raw) {
		return new Map();
	}

	const candidates = [raw];
	if (
		(raw.startsWith("'") && raw.endsWith("'")) ||
		(raw.startsWith('"') && raw.endsWith('"'))
	) {
		candidates.push(raw.slice(1, -1));
	}

	let parsedObject: Record<string, unknown> | null = null;
	for (const candidate of candidates) {
		parsedObject = tryParseObject(candidate);
		if (parsedObject) break;
	}

	if (!parsedObject) {
		throw new Error(
			'Invalid BARDO_API_KEYS_JSON: expected JSON object like {"key":"./customers/user1"}',
		);
	}

	const map = new Map<string, string>();
	for (const [key, value] of Object.entries(parsedObject)) {
		if (!key || typeof value !== "string" || !value.trim()) {
			continue;
		}
		map.set(key, path.resolve(process.cwd(), value));
	}

	return map;
}

export const apiKeyMap = parseApiKeyMapFromEnv();

function isLocalhostRequest(request: Request): boolean {
	try {
		const hostname = new URL(request.url).hostname;
		return (
			hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
		);
	} catch {
		return false;
	}
}

function resolveDefaultApiKeyContext(request: Request): AuthContext | null {
	const defaultApiKey = Bun.env.BARDO_DEFAULT_API_KEY?.trim();
	if (!defaultApiKey) {
		return null;
	}

	const localhostOnly =
		Bun.env.BARDO_DEFAULT_API_KEY_LOCALHOST_ONLY !== "false";
	if (localhostOnly && !isLocalhostRequest(request)) {
		return null;
	}

	const mappedPath = apiKeyMap.get(defaultApiKey);
	if (!mappedPath) {
		console.error(
			`BARDO_DEFAULT_API_KEY is set but not found in BARDO_API_KEYS_JSON: ${defaultApiKey}`,
		);
		return null;
	}

	return { apiKey: defaultApiKey, campaignBasePath: mappedPath };
}

function readApiKey(request: Request): string | null {
	const keyFromHeader = request.headers.get(AUTH_HEADER)?.trim();
	if (keyFromHeader) {
		return keyFromHeader;
	}

	const authHeader = request.headers.get("authorization")?.trim();
	if (authHeader?.startsWith(AUTH_BEARER_PREFIX)) {
		return authHeader.slice(AUTH_BEARER_PREFIX.length).trim() || null;
	}

	const apiKeyFromQuery = new URL(request.url).searchParams
		.get("apiKey")
		?.trim();
	if (apiKeyFromQuery) {
		return apiKeyFromQuery;
	}

	return null;
}

function authError(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			"content-type": "application/json",
			...corsHeaders(),
		},
	});
}

export function authenticateRequest(
	request: Request,
	sessions: Map<string, Session>,
): AuthContext | Response {
	if (apiKeyMap.size === 0) {
		return { apiKey: null, campaignBasePath: process.cwd() };
	}

	const sessionId = request.headers.get("mcp-session-id");
	const existingSession = sessionId ? sessions.get(sessionId) : undefined;
	const apiKey = readApiKey(request);

	if (sessionId && !existingSession && !apiKey) {
		return authError(404, "Session not found.");
	}

	if (existingSession) {
		if (existingSession.apiKey === null) {
			return authError(
				403,
				"Legacy unauthenticated session detected. Reconnect to create a new authenticated session.",
			);
		}

		if (!apiKey) {
			return {
				apiKey: existingSession.apiKey,
				campaignBasePath: existingSession.campaignBasePath,
			};
		}

		const mappedPath = apiKeyMap.get(apiKey);
		if (!mappedPath) {
			return authError(403, "Invalid API key.");
		}

		if (
			existingSession.apiKey !== apiKey ||
			existingSession.campaignBasePath !== mappedPath
		) {
			return authError(403, "Session does not belong to this API key.");
		}

		return { apiKey, campaignBasePath: mappedPath };
	}

	if (!apiKey) {
		const defaultContext = resolveDefaultApiKeyContext(request);
		if (defaultContext) {
			return defaultContext;
		}

		return authError(
			401,
			"Missing API key for new session. Send x-api-key, Authorization: Bearer <key>, or use /mcp?apiKey=<key>.",
		);
	}

	const campaignBasePath = apiKeyMap.get(apiKey);
	if (!campaignBasePath) {
		return authError(403, "Invalid API key.");
	}

	return { apiKey, campaignBasePath };
}
