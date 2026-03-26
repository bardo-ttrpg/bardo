import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

function extractHttpStatus(error: unknown): number | null {
	if (
		error &&
		typeof error === "object" &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	) {
		const status = (error as { status: number }).status;
		if (status >= 400 && status < 600) {
			return status;
		}
	}
	return null;
}

const defaultClerkTimeoutMs = parsePositiveInteger(
	process.env.BARDO_CLERK_API_TIMEOUT_MS,
	15_000,
);

class TimeoutError extends Error {
	constructor(label: string, timeoutMs: number) {
		super(`${label} timed out after ${timeoutMs}ms`);
		this.name = "TimeoutError";
	}
}

function isTimeoutLike(error: unknown): boolean {
	if (error instanceof TimeoutError) {
		return true;
	}
	if (!(error instanceof Error)) {
		return false;
	}
	const name = error.name.toLowerCase();
	const message = error.message.toLowerCase();
	return (
		name.includes("abort") ||
		message.includes("timed out") ||
		message.includes("timeout")
	);
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	label: string,
): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new TimeoutError(label, timeoutMs));
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

type RevokeApiKeyForUserOptions = {
	userId: string;
	clerkKeyId: string;
	route: string;
	createClerkClient?: typeof clerkClient;
	timeoutMs?: number;
};

export async function revokeApiKeyForUser({
	userId,
	clerkKeyId,
	route,
	createClerkClient = clerkClient,
	timeoutMs = defaultClerkTimeoutMs,
}: RevokeApiKeyForUserOptions) {
	const clerk = await createClerkClient();

	let clerkKey: Awaited<ReturnType<(typeof clerk)["apiKeys"]["get"]>>;
	try {
		clerkKey = await withTimeout(
			clerk.apiKeys.get(clerkKeyId),
			timeoutMs,
			"clerk.apiKeys.get",
		);
	} catch (err) {
		if (isTimeoutLike(err)) {
			console.warn("website.api_keys.lookup_timed_out", {
				"bardo.service": "website",
				"bardo.route": route,
				"bardo.operation": "clerk.apiKeys.get",
			});
			return NextResponse.json(
				{ error: "Key lookup timed out. Please retry." },
				{ status: 504 },
			);
		}
		if (extractHttpStatus(err) === 404) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		console.error("website.api_keys.lookup_failed", {
			"bardo.service": "website",
			"bardo.route": route,
			"bardo.operation": "clerk.apiKeys.get",
			error: err instanceof Error ? err.message : String(err),
		});
		return NextResponse.json(
			{ error: "Key lookup failed. Please retry." },
			{ status: 502 },
		);
	}

	if (clerkKey.subject !== userId) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	try {
		await withTimeout(
			clerk.apiKeys.delete(clerkKeyId),
			timeoutMs,
			"clerk.apiKeys.delete",
		);
	} catch (err) {
		if (isTimeoutLike(err)) {
			console.warn("website.api_keys.delete_timed_out", {
				"bardo.service": "website",
				"bardo.route": route,
				"bardo.operation": "clerk.apiKeys.delete",
			});
			return NextResponse.json(
				{ error: "Key deletion timed out. Please retry." },
				{ status: 504 },
			);
		}
		if (extractHttpStatus(err) === 404) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		console.error("website.api_keys.delete_failed", {
			"bardo.service": "website",
			"bardo.route": route,
			"bardo.operation": "clerk.apiKeys.delete",
			error: err instanceof Error ? err.message : String(err),
		});
		return NextResponse.json(
			{ error: "Key deletion failed. Please retry." },
			{ status: 502 },
		);
	}

	return NextResponse.json({ revoked: true, deleted: true });
}

export function resolveClerkApiTimeoutMs() {
	return defaultClerkTimeoutMs;
}
