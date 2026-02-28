type UpstashConfig = {
	url: string;
	token: string;
};

type McpUsageReaderOptions = {
	env?: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	nowMs?: () => number;
};

type UserUsageQuery = {
	subjectId: string;
	periodStartMs: number;
};

type KeyUsageQuery = {
	keyId: string;
	periodStartMs: number;
};

type UsageSnapshot = {
	total: number;
	thisPeriod: number;
	backend: "none" | "upstash";
};

type KeyUsageSnapshot = UsageSnapshot & {
	lastUsedAt: number | null;
	lastUsedProviderId: string | null;
	lastUsedModelId: string | null;
};

function monthBucketFromMs(valueMs: number): string {
	return new Date(valueMs).toISOString().slice(0, 7);
}

function normalizePositiveInteger(value: number): number {
	if (!Number.isFinite(value)) return Date.now();
	return Math.max(0, Math.floor(value));
}

export function listPeriodMonthBuckets(
	periodStartMs: number,
	nowMs = Date.now(),
): string[] {
	const start = new Date(normalizePositiveInteger(periodStartMs));
	const end = new Date(normalizePositiveInteger(nowMs));
	const startYear = start.getUTCFullYear();
	const startMonth = start.getUTCMonth();
	const endYear = end.getUTCFullYear();
	const endMonth = end.getUTCMonth();

	const buckets: string[] = [];
	let year = startYear;
	let month = startMonth;
	while (year < endYear || (year === endYear && month <= endMonth)) {
		buckets.push(
			`${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`,
		);
		month += 1;
		if (month > 11) {
			month = 0;
			year += 1;
		}
	}
	return buckets;
}

function readUpstashConfig(
	env: Record<string, string | undefined>,
): UpstashConfig | null {
	const url = env.UPSTASH_REDIS_REST_URL?.trim();
	const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
	if (!url || !token) return null;
	return { url: url.replace(/\/+$/, ""), token };
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
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

function parseCounterResult(payload: unknown): number {
	if (typeof payload !== "object" || payload === null) return 0;
	const result = (payload as { result?: unknown }).result;
	if (typeof result === "number" && Number.isFinite(result)) {
		return Math.max(0, Math.floor(result));
	}
	if (typeof result === "string") {
		const parsed = Number.parseInt(result, 10);
		if (Number.isFinite(parsed) && parsed >= 0) {
			return parsed;
		}
	}
	return 0;
}

function parseStringResult(payload: unknown): string | null {
	if (typeof payload !== "object" || payload === null) return null;
	const result = (payload as { result?: unknown }).result;
	if (typeof result === "string" && result.trim().length > 0) {
		return result;
	}
	if (typeof result === "number" && Number.isFinite(result)) {
		return String(Math.floor(result));
	}
	return null;
}

function userMonthKey(subjectId: string, month: string): string {
	return `bardo:usage:mcp:user:${subjectId}:month:${month}`;
}

function userTotalKey(subjectId: string): string {
	return `bardo:usage:mcp:user:${subjectId}:total`;
}

function keyMonthKey(keyId: string, month: string): string {
	return `bardo:usage:mcp:key:${keyId}:month:${month}`;
}

function keyTotalKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:total`;
}

function keyLastUsedAtKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_used_at`;
}

function keyLastProviderKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_provider_id`;
}

function keyLastModelKey(keyId: string): string {
	return `bardo:usage:mcp:key:${keyId}:last_model_id`;
}

async function getUpstashValue(
	config: UpstashConfig,
	key: string,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<unknown> {
	const endpoint = `${config.url}/get/${encodeURIComponent(key)}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(endpoint, {
			method: "GET",
			headers: {
				authorization: `Bearer ${config.token}`,
			},
			signal: controller.signal,
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export function createMcpUsageReader(options: McpUsageReaderOptions = {}) {
	const env = options.env ?? process.env;
	const fetchImpl = options.fetchImpl ?? fetch;
	const now = options.nowMs ?? (() => Date.now());
	const upstash = readUpstashConfig(env);
	const readTotals = parseBoolean(env.BARDO_MCP_USAGE_READ_TOTALS, false);
	const readKeyMetadata = parseBoolean(
		env.BARDO_MCP_USAGE_READ_KEY_METADATA,
		false,
	);
	const upstashTimeoutMs = parsePositiveInteger(
		env.BARDO_UPSTASH_TIMEOUT_MS,
		1200,
	);

	async function readMonthlySum(
		buildKey: (month: string) => string,
		periodStartMs: number,
	): Promise<number> {
		if (!upstash) return 0;
		const months = listPeriodMonthBuckets(periodStartMs, now());
		if (months.length === 0) return 0;
		const values = await Promise.all(
			months.map((month) =>
				getUpstashValue(upstash, buildKey(month), fetchImpl, upstashTimeoutMs),
			),
		);
		return values.reduce<number>(
			(sum, payload) => sum + parseCounterResult(payload),
			0,
		);
	}

	async function readTotal(key: string): Promise<number> {
		if (!upstash) return 0;
		const payload = await getUpstashValue(
			upstash,
			key,
			fetchImpl,
			upstashTimeoutMs,
		);
		return parseCounterResult(payload);
	}

	return {
		async readUserUsage(query: UserUsageQuery): Promise<UsageSnapshot> {
			if (!upstash) {
				return { total: 0, thisPeriod: 0, backend: "none" };
			}
			const subjectId = query.subjectId.trim();
			if (!subjectId) {
				return { total: 0, thisPeriod: 0, backend: "upstash" };
			}
			const thisPeriod = await readMonthlySum(
				(month) => userMonthKey(subjectId, month),
				query.periodStartMs,
			);
			const total = readTotals
				? await readTotal(userTotalKey(subjectId))
				: thisPeriod;
			return { total, thisPeriod, backend: "upstash" };
		},
		async readKeyUsage(query: KeyUsageQuery): Promise<KeyUsageSnapshot> {
			if (!upstash) {
				return {
					total: 0,
					thisPeriod: 0,
					lastUsedAt: null,
					lastUsedProviderId: null,
					lastUsedModelId: null,
					backend: "none",
				};
			}
			const keyId = query.keyId.trim();
			if (!keyId) {
				return {
					total: 0,
					thisPeriod: 0,
					lastUsedAt: null,
					lastUsedProviderId: null,
					lastUsedModelId: null,
					backend: "upstash",
				};
			}

			const thisPeriod = await readMonthlySum(
				(month) => keyMonthKey(keyId, month),
				query.periodStartMs,
			);
			const total = readTotals
				? await readTotal(keyTotalKey(keyId))
				: thisPeriod;

			let parsedLastUsedAt = Number.NaN;
			let lastProvider: string | null = null;
			let lastModel: string | null = null;
			if (readKeyMetadata) {
				const [lastUsedAtRaw, lastProviderRaw, lastModelRaw] =
					await Promise.all([
						getUpstashValue(
							upstash,
							keyLastUsedAtKey(keyId),
							fetchImpl,
							upstashTimeoutMs,
						),
						getUpstashValue(
							upstash,
							keyLastProviderKey(keyId),
							fetchImpl,
							upstashTimeoutMs,
						),
						getUpstashValue(
							upstash,
							keyLastModelKey(keyId),
							fetchImpl,
							upstashTimeoutMs,
						),
					]);
				parsedLastUsedAt = Number.parseInt(
					parseStringResult(lastUsedAtRaw) ?? "",
					10,
				);
				lastProvider = parseStringResult(lastProviderRaw);
				lastModel = parseStringResult(lastModelRaw);
			}

			return {
				total,
				thisPeriod,
				lastUsedAt:
					Number.isFinite(parsedLastUsedAt) && parsedLastUsedAt > 0
						? parsedLastUsedAt
						: null,
				lastUsedProviderId: lastProvider,
				lastUsedModelId: lastModel,
				backend: "upstash",
			};
		},
		currentMonth(): string {
			return monthBucketFromMs(now());
		},
	};
}
