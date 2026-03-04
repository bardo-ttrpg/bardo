import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { maxApiKeysForPlan } from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";
import { createMcpUsageReader } from "@/lib/mcp-usage";

export const runtime = "nodejs";

const DEFAULT_KEYS_PAGE_LIMIT = 20;
const MAX_KEYS_PAGE_LIMIT = 100;
const KEY_USAGE_CONCURRENCY = 5;

function keyStatusFromFlags(key: {
	revoked: boolean;
	expired: boolean;
}): string {
	if (key.revoked) return "revoked";
	if (key.expired) return "expired";
	return "active";
}

function clerkErrorMessage(err: unknown): string {
	if (
		err &&
		typeof err === "object" &&
		"errors" in err &&
		Array.isArray((err as { errors: unknown[] }).errors)
	) {
		const first = (err as { errors: { message?: string }[] }).errors[0];
		if (first?.message) {
			return first.message;
		}
	}
	return String(err);
}

function clerkErrorStatus(err: unknown): number {
	if (
		err &&
		typeof err === "object" &&
		"status" in err &&
		typeof (err as { status: unknown }).status === "number"
	) {
		const s = (err as { status: number }).status;
		return s >= 400 && s < 600 ? s : 500;
	}
	return 500;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "true") return true;
	if (normalized === "false") return false;
	return fallback;
}

function parsePositiveIntegerParam(
	value: string | null,
	fallback: number,
	options: {
		min?: number;
		max?: number;
	},
): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(
		options.max ?? Number.MAX_SAFE_INTEGER,
		Math.max(options.min ?? 0, parsed),
	);
}

async function mapWithConcurrency<T, TResult>(
	items: readonly T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
	const results = new Array<TResult>(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index] as T, index);
		}
	}

	const workerCount = Math.min(limit, items.length);
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

// Resolve workspace path using managed-user-root defaults.
// By default custom workspace paths are disabled.
function resolveWorkspacePath(
	raw: string | undefined,
	userId: string,
	env: Record<string, string | undefined> = process.env,
): string {
	const userRoot = `./customers/${userId}`;
	const allowCustom = parseBoolean(
		env.BARDO_ALLOW_CUSTOM_WORKSPACE_PATH,
		false,
	);
	if (!allowCustom) {
		return userRoot;
	}

	const trimmed = raw?.trim();
	if (!trimmed) return userRoot;
	// Reject absolute paths (Unix and Windows) and null bytes.
	if (
		trimmed.startsWith("/") ||
		/^[a-zA-Z]:[\\/]/.test(trimmed) ||
		trimmed.includes("\0")
	) {
		return userRoot;
	}
	// Walk each path segment; reject if any is "..".
	const segments = trimmed.replace(/\\/g, "/").split("/");
	const clean: string[] = [];
	for (const seg of segments) {
		if (seg === "..") return userRoot;
		if (seg === "." || seg === "") continue;
		clean.push(seg);
	}
	const normalized = clean.length > 0 ? `./${clean.join("/")}` : userRoot;
	const allowedPrefix = `${userRoot}/`;
	if (normalized === userRoot || normalized.startsWith(allowedPrefix)) {
		return normalized;
	}
	return userRoot;
}

type KeysGetHandlerDeps = {
	resolveAuthState?: typeof resolveRouteUserId;
	createClerkClient?: typeof clerkClient;
	fetchLiveBilling?: typeof fetchLiveBillingSnapshotFromClerk;
	readKeyUsage?: ReturnType<typeof createMcpUsageReader>["readKeyUsage"];
};

type KeysPostHandlerDeps = {
	resolveAuthState?: typeof resolveRouteUserId;
	createClerkClient?: typeof clerkClient;
	fetchLiveBilling?: typeof fetchLiveBillingSnapshotFromClerk;
	env?: Record<string, string | undefined>;
};

// ─── GET /api/keys ────────────────────────────────────────────────────────────
// Lists Clerk API keys for the authenticated user with offset pagination.
export function createKeysGetHandler(deps: KeysGetHandlerDeps = {}) {
	const resolveAuthState = deps.resolveAuthState ?? resolveRouteUserId;
	const createClerkClient = deps.createClerkClient ?? clerkClient;
	const fetchLiveBilling =
		deps.fetchLiveBilling ?? fetchLiveBillingSnapshotFromClerk;
	const readKeyUsage = deps.readKeyUsage ?? createMcpUsageReader().readKeyUsage;

	return async function GET(request: Request) {
		const authState = await resolveAuthState("/api/keys");
		if (authState.response) {
			return authState.response;
		}

		const { userId } = authState;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const url = new URL(request.url);
		const limit = parsePositiveIntegerParam(
			url.searchParams.get("limit"),
			DEFAULT_KEYS_PAGE_LIMIT,
			{ min: 1, max: MAX_KEYS_PAGE_LIMIT },
		);
		const offset = parsePositiveIntegerParam(
			url.searchParams.get("offset"),
			0,
			{
				min: 0,
			},
		);

		const clerk = await createClerkClient();

		let clerkKeys: Awaited<ReturnType<(typeof clerk)["apiKeys"]["list"]>>;
		try {
			clerkKeys = await clerk.apiKeys.list({ subject: userId, limit, offset });
		} catch (err) {
			Sentry.captureException(err);
			Sentry.logger.error("website.api_keys.list_failed", {
				"bardo.service": "website",
				"bardo.route": "/api/keys",
				"bardo.operation": "clerk.apiKeys.list",
			});
			console.error("[api/keys] clerk.apiKeys.list failed:", err);
			return NextResponse.json(
				{ error: clerkErrorMessage(err) },
				{ status: 500 },
			);
		}

		const liveBilling = await fetchLiveBilling(clerk, userId);
		const periodStartMs = liveBilling.billingUnavailable
			? Date.now()
			: liveBilling.periodStart;

		const keys = await mapWithConcurrency(
			clerkKeys.data,
			KEY_USAGE_CONCURRENCY,
			async (k) => {
				const claims =
					typeof k.claims === "object" && k.claims !== null
						? (k.claims as Record<string, unknown>)
						: {};
				let usage: Awaited<ReturnType<typeof readKeyUsage>>;
				try {
					usage = await readKeyUsage({
						keyId: k.id,
						periodStartMs,
					});
				} catch {
					usage = {
						total: 0,
						thisPeriod: 0,
						lastUsedAt: null,
						lastUsedProviderId: null,
						lastUsedModelId: null,
						backend: "none",
					};
				}
				return {
					id: k.id,
					name: k.name,
					status: keyStatusFromFlags(k),
					scopes: k.scopes ?? [],
					createdAt: k.createdAt,
					workspacePath:
						typeof claims.workspacePath === "string"
							? claims.workspacePath
							: null,
					callsTotal: usage.total,
					callsThisPeriod: usage.thisPeriod,
					lastUsedAt: usage.lastUsedAt,
					lastUsedProviderId: usage.lastUsedProviderId,
					lastUsedModelId: usage.lastUsedModelId,
				};
			},
		);

		const totalCount = clerkKeys.totalCount;
		const candidateNextOffset = offset + keys.length;
		const hasMore = candidateNextOffset < totalCount;

		return NextResponse.json({
			keys,
			page: {
				limit,
				offset,
				totalCount,
				hasMore,
				nextOffset: hasMore ? candidateNextOffset : null,
			},
		});
	};
}

export const GET = createKeysGetHandler();

// ─── POST /api/keys ───────────────────────────────────────────────────────────
// Creates a new Clerk API key and stores workspacePath in key claims.
// The secret is returned once and must be saved by the caller.
export function createKeysPostHandler(deps: KeysPostHandlerDeps = {}) {
	const resolveAuthState = deps.resolveAuthState ?? resolveRouteUserId;
	const createClerkClient = deps.createClerkClient ?? clerkClient;
	const fetchLiveBilling =
		deps.fetchLiveBilling ?? fetchLiveBillingSnapshotFromClerk;
	const env = deps.env ?? process.env;

	return async function POST(request: Request) {
		const authState = await resolveAuthState("/api/keys");
		if (authState.response) {
			return authState.response;
		}

		const { userId } = authState;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		let body: { name?: string; workspacePath?: string; scopes?: string[] } = {};
		try {
			body = (await request.json()) as typeof body;
		} catch {
			body = {};
		}

		const clerk = await createClerkClient();

		const liveBilling = await fetchLiveBilling(clerk, userId);
		if (liveBilling.billingUnavailable) {
			return NextResponse.json(
				{ error: "Billing service unavailable, please try again" },
				{ status: 503 },
			);
		}
		const maxAllowed = maxApiKeysForPlan(liveBilling.plan);

		let activeCount: number;
		try {
			const probe = await clerk.apiKeys.list({ subject: userId, limit: 1 });
			activeCount = probe.totalCount;
		} catch (err) {
			Sentry.captureException(err);
			Sentry.logger.error("website.api_keys.limit_probe_failed", {
				"bardo.service": "website",
				"bardo.route": "/api/keys",
				"bardo.operation": "clerk.apiKeys.list",
			});
			console.error(
				"[api/keys] clerk.apiKeys.list failed:",
				clerkErrorMessage(err),
			);
			return NextResponse.json(
				{ error: clerkErrorMessage(err) },
				{ status: 500 },
			);
		}

		if (activeCount >= maxAllowed) {
			return NextResponse.json(
				{ error: "API key limit reached for your plan" },
				{ status: 403 },
			);
		}

		const name = body.name?.trim() || "Default key";
		const workspacePath = resolveWorkspacePath(body.workspacePath, userId, env);
		const scopes =
			Array.isArray(body.scopes) && body.scopes.length > 0
				? body.scopes
				: ["mcp"];

		let newKey: Awaited<ReturnType<(typeof clerk)["apiKeys"]["create"]>>;
		try {
			newKey = await clerk.apiKeys.create({
				name,
				subject: userId,
				scopes,
				claims: { workspacePath },
			});
		} catch (err) {
			const msg = clerkErrorMessage(err);
			Sentry.captureException(err);
			Sentry.logger.error("website.api_keys.create_failed", {
				"bardo.service": "website",
				"bardo.route": "/api/keys",
				"bardo.operation": "clerk.apiKeys.create",
			});
			console.error("[api/keys] clerk.apiKeys.create failed:", msg);
			return NextResponse.json(
				{ error: msg },
				{ status: clerkErrorStatus(err) },
			);
		}

		return NextResponse.json({
			key: {
				id: newKey.id,
				name: newKey.name,
				status: keyStatusFromFlags(newKey),
				scopes: newKey.scopes ?? scopes,
				createdAt: newKey.createdAt,
				workspacePath,
			},
			secret: newKey.secret,
		});
	};
}

export const POST = createKeysPostHandler();
