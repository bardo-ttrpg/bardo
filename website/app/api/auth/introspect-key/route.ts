import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createIntrospectionSecretValidator } from "@/lib/api-key-introspection";

export const runtime = "nodejs";

type IntrospectRequest = {
	apiKey?: string;
	requiredScope?: string;
	providerId?: string;
	modelId?: string;
};

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

	// ── Validate via Clerk API keys ──────────────────────────────────────────
	let clerkKey: Awaited<
		ReturnType<Awaited<ReturnType<typeof clerkClient>>["apiKeys"]["verify"]>
	>;
	try {
		const clerk = await clerkClient();
		clerkKey = await clerk.apiKeys.verify(secret);
	} catch {
		return NextResponse.json({ valid: false }, { status: 200 });
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

	if (!workspacePath) {
		// Key has no workspacePath metadata — treat as invalid (created outside
		// this system or metadata missing).
		return NextResponse.json({ valid: false }, { status: 200 });
	}

	return NextResponse.json({
		valid: true,
		campaignBasePath: workspacePath,
		keyPrefix: clerkKey.id.slice(0, 15),
	});
}
