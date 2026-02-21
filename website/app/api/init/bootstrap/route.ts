import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { requestInitBootstrap } from "@/lib/mcp-orchestrator";

export const runtime = "nodejs";

function json(status: number, payload: Record<string, unknown>): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
	issuerDomain: process.env.CLERK_JWT_ISSUER_DOMAIN,
});

export async function POST(req: NextRequest) {
	if (!IS_CLERK_CONFIGURED) {
		return json(503, { error: "Auth is not configured." });
	}

	const { userId } = await auth();
	if (!userId) {
		return json(401, { error: "Authentication required." });
	}

	let payload: { answers?: unknown; workspaceId?: unknown } = {};
	try {
		payload = (await req.json()) as {
			answers?: unknown;
			workspaceId?: unknown;
		};
	} catch {
		payload = {};
	}

	const workspaceId =
		typeof payload.workspaceId === "string" ? payload.workspaceId : undefined;
	const answers =
		typeof payload.answers === "object" && payload.answers !== null
			? (payload.answers as Record<string, string>)
			: undefined;

	const result = await requestInitBootstrap({
		answers,
		workspaceId,
	});

	const statusCode = result.success ? 200 : 502;
	return json(statusCode, result as unknown as Record<string, unknown>);
}
