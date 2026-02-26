import path from "node:path";
import type { AuthContext } from "../../types/contracts";

export type ApiKeyValidatorMetadata = {
	requiredScope?: "mcp" | "api";
	providerId?: string | null;
	modelId?: string | null;
	workspaceRoot?: string | null;
};

export type ApiKeyValidator = (
	apiKey: string,
	metadata?: ApiKeyValidatorMetadata,
) => Promise<AuthContext | null>;

type AuthProviderMode = "env" | "hosted" | "hybrid";

type RuntimeApiKeyValidator = {
	mode: AuthProviderMode;
	validateApiKey: ApiKeyValidator | null;
};

type HostedValidatorConfig = {
	introspectionUrl: string;
	introspectionToken: string | null;
	cacheTtlMs: number;
	fetchImpl?: typeof fetch;
};

type HostedIntrospectionResponse =
	| {
			valid: true;
			campaignBasePath: string;
	  }
	| {
			valid: false;
	  };

function normalizeProviderMode(
	raw: string | undefined,
): AuthProviderMode | null {
	const normalized = raw?.trim().toLowerCase();
	if (normalized === "env") return "env";
	if (normalized === "hosted") return "hosted";
	if (normalized === "hybrid") return "hybrid";
	return null;
}

function parsePositiveInteger(
	value: string | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.floor(parsed);
}

function parseHostedIntrospectionPayload(
	payload: unknown,
	projectRoot: string,
): AuthContext | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const record = payload as Record<string, unknown>;
	if (record.valid !== true) {
		return null;
	}
	if (typeof record.campaignBasePath !== "string") {
		return null;
	}

	return {
		apiKey: null,
		campaignBasePath: path.resolve(projectRoot, record.campaignBasePath),
	};
}

export function createHostedIntrospectionApiKeyValidator(
	config: HostedValidatorConfig,
	projectRoot: string,
): ApiKeyValidator {
	const cache = new Map<
		string,
		{ expiresAt: number; value: AuthContext | null }
	>();
	const fetchImpl = config.fetchImpl ?? fetch;

	return async function hostedApiKeyValidator(
		apiKey: string,
		metadata?: ApiKeyValidatorMetadata,
	): Promise<AuthContext | null> {
		const now = Date.now();
		const cached = cache.get(apiKey);
		if (cached && cached.expiresAt > now) {
			if (!cached.value) return null;
			return { ...cached.value, apiKey };
		}

		const headers = new Headers({
			"content-type": "application/json",
		});
		if (config.introspectionToken) {
			headers.set("x-bardo-introspection-token", config.introspectionToken);
		}

		let payload: unknown = null;
		try {
			const response = await fetchImpl(config.introspectionUrl, {
				method: "POST",
				headers,
				body: JSON.stringify({
					apiKey,
					requiredScope: metadata?.requiredScope ?? "mcp",
					providerId: metadata?.providerId ?? undefined,
					modelId: metadata?.modelId ?? undefined,
					workspaceRoot: metadata?.workspaceRoot ?? undefined,
				}),
			});
			if (!response.ok) {
				cache.set(apiKey, {
					expiresAt: now + config.cacheTtlMs,
					value: null,
				});
				return null;
			}
			payload = (await response.json()) as HostedIntrospectionResponse;
		} catch {
			return null;
		}

		const context = parseHostedIntrospectionPayload(payload, projectRoot);
		cache.set(apiKey, { expiresAt: now + config.cacheTtlMs, value: context });
		if (!context) {
			return null;
		}
		return { ...context, apiKey };
	};
}

function createEnvApiKeyValidator(
	apiKeyMap: Map<string, string>,
): ApiKeyValidator {
	return async function envApiKeyValidator(
		apiKey: string,
		_metadata?: ApiKeyValidatorMetadata,
	): Promise<AuthContext | null> {
		const campaignBasePath = apiKeyMap.get(apiKey);
		if (!campaignBasePath) return null;
		return { apiKey, campaignBasePath };
	};
}

export function resolveRuntimeApiKeyValidator(args: {
	env?: Record<string, string | undefined>;
	apiKeyMap: Map<string, string>;
	projectRoot: string;
}): RuntimeApiKeyValidator {
	const env = args.env ?? Bun.env;
	const explicitMode = normalizeProviderMode(env.BARDO_AUTH_PROVIDER);
	const implicitMode: AuthProviderMode = env.BARDO_AUTH_INTROSPECTION_URL
		? "hybrid"
		: "env";
	const mode = explicitMode ?? implicitMode;

	const envValidator = createEnvApiKeyValidator(args.apiKeyMap);

	if (mode === "env") {
		return {
			mode,
			validateApiKey: envValidator,
		};
	}

	const introspectionUrl = env.BARDO_AUTH_INTROSPECTION_URL?.trim();
	if (!introspectionUrl) {
		if (mode === "hosted") {
			return { mode, validateApiKey: null };
		}
		return { mode, validateApiKey: envValidator };
	}

	const hostedValidator = createHostedIntrospectionApiKeyValidator(
		{
			introspectionUrl,
			introspectionToken: env.BARDO_AUTH_INTROSPECTION_TOKEN?.trim() ?? null,
			cacheTtlMs: parsePositiveInteger(env.BARDO_AUTH_CACHE_TTL_MS, 120_000),
		},
		args.projectRoot,
	);

	if (mode === "hosted") {
		return { mode, validateApiKey: hostedValidator };
	}

	return {
		mode,
		validateApiKey: async (apiKey) => {
			const hosted = await hostedValidator(apiKey);
			if (hosted) return hosted;
			return envValidator(apiKey);
		},
	};
}
