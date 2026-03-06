import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
	resolveClerkApiTimeoutMs,
	revokeApiKeyForUser,
} from "@/lib/api-key-revocation";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";

export const runtime = "nodejs";

type RevokeRequest = {
	id?: string;
};

type KeysRevokePostHandlerDeps = {
	resolveAuthState?: typeof resolveRouteUserId;
	createClerkClient?: typeof clerkClient;
	timeoutMs?: number;
};

export function createKeysRevokePostHandler(
	deps: KeysRevokePostHandlerDeps = {},
) {
	const resolveAuthState = deps.resolveAuthState ?? resolveRouteUserId;
	const createClerkClient = deps.createClerkClient ?? clerkClient;
	const timeoutMs = deps.timeoutMs ?? resolveClerkApiTimeoutMs();

	return async function POST(request: Request) {
		const authState = await resolveAuthState("/api/keys/revoke");
		if (authState.response) {
			return authState.response;
		}

		const { userId } = authState;
		if (!userId) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		let body: RevokeRequest = {};
		try {
			body = (await request.json()) as RevokeRequest;
		} catch {
			body = {};
		}

		const clerkKeyId = body.id?.trim();
		if (!clerkKeyId) {
			return NextResponse.json({ error: "Missing key ID" }, { status: 400 });
		}

		return revokeApiKeyForUser({
			userId,
			clerkKeyId,
			route: "/api/keys/revoke",
			createClerkClient,
			timeoutMs,
		});
	};
}

export const POST = createKeysRevokePostHandler();
