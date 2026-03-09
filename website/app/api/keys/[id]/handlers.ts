import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	resolveClerkApiTimeoutMs,
	revokeApiKeyForUser,
} from "@/lib/api-key-revocation";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";

export const runtime = "nodejs";

// ─── DELETE /api/keys/[id] ────────────────────────────────────────────────────
// Revokes a Clerk API key.

type KeyByIdDeleteHandlerDeps = {
	resolveAuthState?: typeof resolveRouteUserId;
	createClerkClient?: typeof clerkClient;
	timeoutMs?: number;
};

export function createKeyByIdDeleteHandler(
	deps: KeyByIdDeleteHandlerDeps = {},
) {
	const resolveAuthState = deps.resolveAuthState ?? resolveRouteUserId;
	const createClerkClient = deps.createClerkClient ?? clerkClient;
	const timeoutMs = deps.timeoutMs ?? resolveClerkApiTimeoutMs();

	return async function DELETE(
		_request: Request,
		{ params }: { params: Promise<{ id: string }> },
	) {
		const authState = await resolveAuthState("/api/keys/[id]");
		if (authState.response) {
			return authState.response;
		}

		const { userId } = authState;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id: clerkKeyId } = await params;
		if (!clerkKeyId) {
			return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
		}

		return revokeApiKeyForUser({
			userId,
			clerkKeyId,
			route: "/api/keys/[id]",
			createClerkClient,
			timeoutMs,
		});
	};
}

export const DELETE = createKeyByIdDeleteHandler();
