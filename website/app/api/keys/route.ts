import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { maxApiKeysForPlan } from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";
import { createMcpUsageReader } from "@/lib/mcp-usage";

export const runtime = "nodejs";

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

// ─── GET /api/keys ────────────────────────────────────────────────────────────
// Lists all Clerk API keys for the authenticated user.

export async function GET() {
	const authState = await resolveRouteUserId("/api/keys");
	if (authState.response) {
		return authState.response;
	}

	const { userId } = authState;
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const clerk = await clerkClient();
	const usageReader = createMcpUsageReader();

	let clerkKeys: Awaited<ReturnType<(typeof clerk)["apiKeys"]["list"]>>;
	try {
		clerkKeys = await clerk.apiKeys.list({ subject: userId, limit: 100 });
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

	const liveBilling = await fetchLiveBillingSnapshotFromClerk(clerk, userId);
	const periodStartMs = liveBilling.billingUnavailable
		? Date.now()
		: liveBilling.periodStart;

	const keys = await Promise.all(
		clerkKeys.data.map(async (k) => {
			const claims =
				typeof k.claims === "object" && k.claims !== null
					? (k.claims as Record<string, unknown>)
					: {};
			const usage = await usageReader.readKeyUsage({
				keyId: k.id,
				periodStartMs,
			});
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
		}),
	);

	return NextResponse.json({ keys });
}

// ─── POST /api/keys ───────────────────────────────────────────────────────────
// Creates a new Clerk API key and stores workspacePath in key claims.
// The secret is returned once and must be saved by the caller.

export async function POST(request: Request) {
	const authState = await resolveRouteUserId("/api/keys");
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

	const clerk = await clerkClient();

	// Read plan from live Clerk billing state for key-limit enforcement.
	const liveBilling = await fetchLiveBillingSnapshotFromClerk(clerk, userId);
	if (liveBilling.billingUnavailable) {
		return NextResponse.json(
			{ error: "Billing service unavailable, please try again" },
			{ status: 503 },
		);
	}
	const maxAllowed = maxApiKeysForPlan(liveBilling.plan);

	// Use totalCount from a minimal query — avoids undercounting when a user
	// has more active keys than a single page can return.
	// includeInvalid defaults to false so totalCount reflects active keys only.
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
	const workspacePath = resolveWorkspacePath(body.workspacePath, userId);
	const scopes =
		Array.isArray(body.scopes) && body.scopes.length > 0
			? body.scopes
			: ["mcp"];

	// Create the key in Clerk with claims set at creation time.
	// The secret is returned only once.
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
		return NextResponse.json({ error: msg }, { status: clerkErrorStatus(err) });
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
}
