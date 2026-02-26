import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { maxApiKeysForPlan } from "@/lib/api-keys";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";

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
		Array.isArray((err as { errors: unknown[] }).errors) &&
		(err as { errors: { message?: string }[] }).errors[0]?.message
	) {
		return (err as { errors: { message: string }[] }).errors[0].message;
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

// Rejects absolute paths and path-traversal segments so user-supplied
// workspacePath cannot escape the intended tenant directory on the MCP host.
function sanitizeWorkspacePath(raw: string | undefined, fallback: string): string {
	const trimmed = raw?.trim();
	if (!trimmed) return fallback;
	// Reject absolute paths (Unix and Windows) and null bytes.
	if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.includes("\0")) {
		return fallback;
	}
	// Walk each path segment; reject if any is "..".
	const segments = trimmed.replace(/\\/g, "/").split("/");
	const clean: string[] = [];
	for (const seg of segments) {
		if (seg === "..") return fallback;
		if (seg === "." || seg === "") continue;
		clean.push(seg);
	}
	return clean.length > 0 ? `./${clean.join("/")}` : fallback;
}

// ─── GET /api/keys ────────────────────────────────────────────────────────────
// Lists all Clerk API keys for the authenticated user.

export async function GET() {
	const { userId } = await auth();
	if (!userId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const clerk = await clerkClient();

	let clerkKeys: Awaited<
		ReturnType<(typeof clerk)["apiKeys"]["list"]>
	>;
	try {
		clerkKeys = await clerk.apiKeys.list({ subject: userId, limit: 100 });
	} catch (err) {
		console.error("[api/keys] clerk.apiKeys.list failed:", err);
		return NextResponse.json(
			{ error: clerkErrorMessage(err) },
			{ status: 500 },
		);
	}

	const keys = clerkKeys.data.map((k) => {
		const claims =
			typeof k.claims === "object" && k.claims !== null
				? (k.claims as Record<string, unknown>)
				: {};
		return {
			id: k.id,
			name: k.name,
			status: keyStatusFromFlags(k),
			scopes: k.scopes ?? [],
			createdAt: k.createdAt,
			workspacePath:
				typeof claims.workspacePath === "string" ? claims.workspacePath : null,
			callsTotal: 0,
			callsThisPeriod: 0,
			lastUsedAt: null,
			lastUsedProviderId: null,
			lastUsedModelId: null,
		};
	});

	return NextResponse.json({ keys });
}

// ─── POST /api/keys ───────────────────────────────────────────────────────────
// Creates a new Clerk API key and stores workspacePath in key claims.
// The secret is returned once and must be saved by the caller.

export async function POST(request: Request) {
	const { userId } = await auth();
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
	// has more active keys than a single page can return (plans allow up to 250).
	// includeInvalid defaults to false so totalCount reflects active keys only.
	let activeCount: number;
	try {
		const probe = await clerk.apiKeys.list({ subject: userId, limit: 1 });
		activeCount = probe.totalCount;
	} catch (err) {
		console.error("[api/keys] clerk.apiKeys.list failed:", clerkErrorMessage(err));
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
	const workspacePath = sanitizeWorkspacePath(
		body.workspacePath,
		`./customers/${userId}`,
	);
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
}
