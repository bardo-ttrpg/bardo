import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	createIntrospectionSecretValidator,
	resolveRequestedWorkspaceRoot,
} from "@/lib/api-key-introspection";
import {
	createDailyVerificationBudgetLimiter,
	createSubjectPlanCache,
} from "@/lib/api-key-verification-policy";
import { fetchLiveBillingSnapshotFromClerk } from "@/lib/clerk-live-billing";
import type { PlanTier } from "@/lib/user-billing";

export const runtime = "nodejs";

type IntrospectRequest = {
	apiKey?: string;
	requiredScope?: string;
	providerId?: string;
	modelId?: string;
	workspaceRoot?: string;
};

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

function extractSubjectFromVerifiedKey(
	clerkKey: Record<string, unknown>,
): string | null {
	if (typeof clerkKey.subject === "string" && clerkKey.subject.trim()) {
		return clerkKey.subject.trim();
	}
	const claims =
		typeof clerkKey.claims === "object" && clerkKey.claims !== null
			? (clerkKey.claims as Record<string, unknown>)
			: {};
	const subjectCandidates = ["subject", "sub", "userId", "user_id"];
	for (const candidate of subjectCandidates) {
		const value = claims[candidate];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function extractVerifiedKeyId(
	clerkKey: Record<string, unknown>,
	apiKeySecret: string,
): string {
	if (typeof clerkKey.id === "string" && clerkKey.id.trim()) {
		return clerkKey.id.trim();
	}
	return `ak:${apiKeySecret.slice(0, 16)}`;
}

const verificationLimiter = createDailyVerificationBudgetLimiter();
const subjectPlanCache = createSubjectPlanCache({
	ttlMs: parsePositiveInteger(
		process.env.BARDO_INTROSPECTION_PLAN_CACHE_TTL_MS,
		300_000,
	),
});

export async function POST(request: Request) {
	// Validate the server-to-server introspection secret.
	const authorize = createIntrospectionSecretValidator(
		process.env.BARDO_AUTH_INTROSPECTION_TOKEN,
	);
	if (!authorize(request.headers)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: IntrospectRequest = {};
	try {
		body = (await request.json()) as IntrospectRequest;
	} catch {
		body = {};
	}

	const secret = body.apiKey?.trim();
	if (!secret) {
		return NextResponse.json({ valid: false }, { status: 200 });
	}

	const requestedWorkspaceRoot = resolveRequestedWorkspaceRoot({
		rawWorkspaceRoot: body.workspaceRoot,
		allowOverrideEnv: process.env.BARDO_ALLOW_WORKSPACE_ROOT_OVERRIDE,
		allowlistEnv: process.env.BARDO_WORKSPACE_ROOT_ALLOWLIST,
	});

	// ── Validate via Clerk API keys ──────────────────────────────────────────
	const clerk = await clerkClient();
	let clerkKey: Awaited<
		ReturnType<Awaited<ReturnType<typeof clerkClient>>["apiKeys"]["verify"]>
	>;
	try {
		clerkKey = await clerk.apiKeys.verify(secret);
	} catch {
		return NextResponse.json({ valid: false }, { status: 200 });
	}

	const keyRecord = clerkKey as unknown as Record<string, unknown>;
	const subject = extractSubjectFromVerifiedKey(keyRecord);
	let plan: PlanTier = "free";
	if (subject) {
		plan = await subjectPlanCache.resolve(subject, async () => {
			const live = await fetchLiveBillingSnapshotFromClerk(clerk, subject);
			return live.billingUnavailable ? "free" : live.plan;
		});
	}

	const userUsage = subject
		? await verificationLimiter.consumeUser(subject, plan)
		: null;
	if (userUsage && !userUsage.allowed) {
		return NextResponse.json(
			{
				valid: false,
				reason: "daily_user_verification_limit_reached",
				verification: {
					user: userUsage,
					key: null,
				},
			},
			{ status: 200 },
		);
	}
	const keyUsage = await verificationLimiter.consumeKey(
		extractVerifiedKeyId(keyRecord, secret),
		plan,
	);
	if (!keyUsage.allowed) {
		return NextResponse.json(
			{
				valid: false,
				reason: "daily_key_verification_limit_reached",
				verification: {
					user: userUsage,
					key: keyUsage,
				},
			},
			{ status: 200 },
		);
	}

	// Verify the required scope is present on this key.
	const requiredScope = body.requiredScope?.trim() || "mcp";
	if (!clerkKey.scopes?.includes(requiredScope)) {
		return NextResponse.json({ valid: false }, { status: 200 });
	}

	// ── Read workspacePath from Clerk API key claims ─────────────────────────
	const claims =
		typeof clerkKey.claims === "object" && clerkKey.claims !== null
			? (clerkKey.claims as Record<string, unknown>)
			: {};
	const workspacePath =
		typeof claims.workspacePath === "string" ? claims.workspacePath : null;

	if (!workspacePath && !requestedWorkspaceRoot) {
		// Key has no workspacePath metadata — treat as invalid (created outside
		// this system or metadata missing).
		return NextResponse.json({ valid: false }, { status: 200 });
	}

	return NextResponse.json({
		valid: true,
		campaignBasePath: requestedWorkspaceRoot ?? workspacePath,
		keyPrefix: clerkKey.id.slice(0, 15),
		plan,
		verification: {
			user: userUsage,
			key: keyUsage,
		},
	});
}
