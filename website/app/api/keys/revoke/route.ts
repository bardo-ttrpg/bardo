import { clerkClient } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { resolveRouteUserId } from "@/lib/clerk-route-auth";

export const runtime = "nodejs";

type RevokeRequest = {
	id?: string;
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

const clerkTimeoutMs = parsePositiveInteger(
	process.env.BARDO_CLERK_API_TIMEOUT_MS,
	15_000,
);

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});
	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

export async function POST(request: Request) {
	const authState = await resolveRouteUserId("/api/keys/revoke");
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

	const clerk = await clerkClient();

	let clerkKey: Awaited<ReturnType<(typeof clerk)["apiKeys"]["get"]>>;
	try {
		clerkKey = await withTimeout(
			clerk.apiKeys.get(clerkKeyId),
			clerkTimeoutMs,
			"clerk.apiKeys.get",
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes("timed out")) {
			Sentry.logger.warn("website.api_keys.lookup_timed_out", {
				"bardo.service": "website",
				"bardo.route": "/api/keys/revoke",
				"bardo.operation": "clerk.apiKeys.get",
			});
			return NextResponse.json(
				{ error: "Key lookup timed out. Please retry." },
				{ status: 504 },
			);
		}
		Sentry.captureException(err);
		Sentry.logger.error("website.api_keys.lookup_failed", {
			"bardo.service": "website",
			"bardo.route": "/api/keys/revoke",
			"bardo.operation": "clerk.apiKeys.get",
		});
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	if (clerkKey.subject !== userId) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		await withTimeout(
			clerk.apiKeys.delete(clerkKeyId),
			clerkTimeoutMs,
			"clerk.apiKeys.delete",
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error("[api/keys/revoke] clerk.apiKeys.delete failed:", message);
		if (message.includes("timed out")) {
			Sentry.logger.warn("website.api_keys.delete_timed_out", {
				"bardo.service": "website",
				"bardo.route": "/api/keys/revoke",
				"bardo.operation": "clerk.apiKeys.delete",
			});
			return NextResponse.json(
				{ error: "Key deletion timed out. Please retry." },
				{ status: 504 },
			);
		}
		Sentry.captureException(err);
		Sentry.logger.error("website.api_keys.delete_failed", {
			"bardo.service": "website",
			"bardo.route": "/api/keys/revoke",
			"bardo.operation": "clerk.apiKeys.delete",
		});
		return NextResponse.json(
			{ error: "Failed to delete key" },
			{ status: 500 },
		);
	}

	return NextResponse.json({ revoked: true, deleted: true });
}
