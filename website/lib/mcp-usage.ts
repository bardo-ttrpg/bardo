import { createWebsiteBackendClient } from "./website-backend";

type McpUsageReaderOptions = {
	env?: Record<string, string | undefined>;
	websiteBackend?: {
		readUserUsage(clerkUserId: string): Promise<UsageSnapshot>;
		readKeyUsage(args: KeyUsageQuery): Promise<KeyUsageSnapshot>;
	} | null;
	controlPlane?: {
		readUserUsage(clerkUserId: string): Promise<UsageSnapshot>;
		readKeyUsage(args: KeyUsageQuery): Promise<KeyUsageSnapshot>;
	} | null;
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
	backend: "none" | "website";
};

type KeyUsageSnapshot = UsageSnapshot & {
	lastUsedAt: number | null;
	lastUsedProviderId: string | null;
	lastUsedModelId: string | null;
};

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

export function createMcpUsageReader(options: McpUsageReaderOptions = {}) {
	const env = options.env ?? process.env;
	const websiteBackend =
		options.websiteBackend !== undefined
			? options.websiteBackend
			: options.controlPlane === undefined
				? (() => {
						try {
							return createWebsiteBackendClient(env);
						} catch {
							return null;
						}
					})()
				: options.controlPlane;

	return {
		async readUserUsage(query: UserUsageQuery): Promise<UsageSnapshot> {
			if (!websiteBackend) {
				return { total: 0, thisPeriod: 0, backend: "none" };
			}
			const subjectId = query.subjectId.trim();
			if (!subjectId) {
				return { total: 0, thisPeriod: 0, backend: "none" };
			}
			return await websiteBackend.readUserUsage(subjectId);
		},

		async readKeyUsage(query: KeyUsageQuery): Promise<KeyUsageSnapshot> {
			if (!websiteBackend) {
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
					backend: "none",
				};
			}
			return await websiteBackend.readKeyUsage(query);
		},
	};
}
