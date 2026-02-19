import path from "node:path";
import {
	AUTH_BEARER_PREFIX,
	AUTH_HEADER,
	PROJECT_ROOT,
} from "../../domain/config/constants";
import {
	SECURITY_POLICY,
	type SecurityPolicy,
} from "../../domain/config/security";
import type { AuthContext, Session } from "../../types/contracts";
import { corsHeaders } from "./cors";

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

export function parseApiKeyMapFromEnv(
	env: Record<string, string | undefined> = Bun.env,
	projectRoot = PROJECT_ROOT,
): Map<string, string> {
	const raw = env.BARDO_API_KEYS_JSON?.trim();
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
		map.set(key, path.resolve(projectRoot, value));
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

function resolveDefaultApiKeyContext(
	request: Request,
	map: Map<string, string>,
): AuthContext | null {
	const defaultApiKey = Bun.env.BARDO_DEFAULT_API_KEY?.trim();
	if (!defaultApiKey) {
		return null;
	}

	const localhostOnly =
		Bun.env.BARDO_DEFAULT_API_KEY_LOCALHOST_ONLY !== "false";
	if (localhostOnly && !isLocalhostRequest(request)) {
		return null;
	}

	const mappedPath = map.get(defaultApiKey);
	if (!mappedPath) {
		console.error(
			"BARDO_DEFAULT_API_KEY is set but not present in BARDO_API_KEYS_JSON.",
		);
		return null;
	}

	return { apiKey: defaultApiKey, campaignBasePath: mappedPath };
}

function readApiKey(
	request: Request,
	allowQueryApiKey: boolean,
): string | null {
	const keyFromHeader = request.headers.get(AUTH_HEADER)?.trim();
	if (keyFromHeader) {
		return keyFromHeader;
	}

	const authHeader = request.headers.get("authorization")?.trim();
	if (authHeader?.startsWith(AUTH_BEARER_PREFIX)) {
		return authHeader.slice(AUTH_BEARER_PREFIX.length).trim() || null;
	}

	if (allowQueryApiKey) {
		const apiKeyFromQuery = new URL(request.url).searchParams
			.get("apiKey")
			?.trim();
		if (apiKeyFromQuery) {
			return apiKeyFromQuery;
		}
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

function missingApiKeyMessage(allowQueryApiKey: boolean): string {
	return allowQueryApiKey
		? "Missing API key for new session. Send x-api-key, Authorization: Bearer <key>, or use /mcp?apiKey=<key>."
		: "Missing API key for new session. Send x-api-key or Authorization: Bearer <key>.";
}

type AuthenticatorDeps = {
	apiKeyMap: Map<string, string>;
	policy: SecurityPolicy;
	projectRoot: string;
};

export function createAuthenticator({
	apiKeyMap,
	policy,
	projectRoot,
}: AuthenticatorDeps) {
	return function authenticateRequest(
		request: Request,
		sessions: Map<string, Session>,
	): AuthContext | Response {
		if (policy.authMode === "required" && apiKeyMap.size === 0) {
			return authError(
				503,
				"Authentication is required but BARDO_API_KEYS_JSON is not configured.",
			);
		}

		if (apiKeyMap.size === 0) {
			return { apiKey: null, campaignBasePath: projectRoot };
		}

		const sessionId = request.headers.get("mcp-session-id");
		const existingSession = sessionId ? sessions.get(sessionId) : undefined;
		const apiKey = readApiKey(request, policy.allowQueryApiKey);

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
			const defaultContext = resolveDefaultApiKeyContext(request, apiKeyMap);
			if (defaultContext) {
				return defaultContext;
			}

			return authError(401, missingApiKeyMessage(policy.allowQueryApiKey));
		}

		const campaignBasePath = apiKeyMap.get(apiKey);
		if (!campaignBasePath) {
			return authError(403, "Invalid API key.");
		}

		return { apiKey, campaignBasePath };
	};
}

const runtimeAuthenticator = createAuthenticator({
	apiKeyMap,
	policy: SECURITY_POLICY,
	projectRoot: PROJECT_ROOT,
});

export function authenticateRequest(
	request: Request,
	sessions: Map<string, Session>,
): AuthContext | Response {
	return runtimeAuthenticator(request, sessions);
}
