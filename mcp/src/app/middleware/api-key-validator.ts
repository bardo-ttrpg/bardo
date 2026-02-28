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
	invalidCacheTtlMs?: number;
	timeoutMs?: number;
	fetchImpl?: typeof fetch;
};

type HostedIntrospectionResponse =
	| {
			valid: true;
			campaignBasePath: string;
			subjectId?: string;
			keyId?: string;
			plan?: "free" | "solo" | "solo_plus";
			mcpPeriodLimit?: number;
	  }
	| {
			valid: false;
	  };

function normalizePositiveInteger(value: number | undefined, fallback: number) {
	if (!Number.isFinite(value)) {
		return fallback;
	}
	const normalized = Math.floor(value ?? fallback);
	return normalized > 0 ? normalized : fallback;
}

function buildCacheKey(
	apiKey: string,
	metadata?: ApiKeyValidatorMetadata,
): string {
	const requiredScope = metadata?.requiredScope ?? "mcp";
	const workspaceRoot = metadata?.workspaceRoot?.trim() ?? "";
	return `${apiKey}::${requiredScope}::${workspaceRoot}`;
}

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

	const subjectId =
		typeof record.subjectId === "string" && record.subjectId.trim().length > 0
			? record.subjectId.trim()
			: null;
	const keyId =
		typeof record.keyId === "string" && record.keyId.trim().length > 0
			? record.keyId.trim()
			: null;
	const plan =
		record.plan === "free" ||
		record.plan === "solo" ||
		record.plan === "solo_plus"
			? record.plan
			: null;
	const mcpPeriodLimit =
		typeof record.mcpPeriodLimit === "number" &&
		Number.isFinite(record.mcpPeriodLimit) &&
		record.mcpPeriodLimit > 0
			? Math.floor(record.mcpPeriodLimit)
			: null;

	return {
		apiKey: null,
		campaignBasePath: path.resolve(projectRoot, record.campaignBasePath),
		subjectId,
		keyId,
		plan,
		mcpPeriodLimit,
	};
}

export function createHostedIntrospectionApiKeyValidator(
	config: HostedValidatorConfig,
	projectRoot: string,
): ApiKeyValidator {
	const validCacheTtlMs = normalizePositiveInteger(config.cacheTtlMs, 120_000);
	const invalidCacheTtlMs = normalizePositiveInteger(
		config.invalidCacheTtlMs,
		30_000,
	);
	const timeoutMs = normalizePositiveInteger(config.timeoutMs, 10_000);
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
		const cacheKey = buildCacheKey(apiKey, metadata);
		const cached = cache.get(cacheKey);
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
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
				signal: controller.signal,
			});
			if (!response.ok) {
				return null;
			}
			payload = (await response.json()) as HostedIntrospectionResponse;
		} catch {
			return null;
		} finally {
			clearTimeout(timeout);
		}

		const context = parseHostedIntrospectionPayload(payload, projectRoot);
		cache.set(cacheKey, {
			expiresAt: now + (context ? validCacheTtlMs : invalidCacheTtlMs),
			value: context,
		});
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
			invalidCacheTtlMs: parsePositiveInteger(
				env.BARDO_AUTH_INVALID_CACHE_TTL_MS,
				30_000,
			),
			timeoutMs: parsePositiveInteger(
				env.BARDO_AUTH_INTROSPECTION_TIMEOUT_MS,
				10_000,
			),
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
