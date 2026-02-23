import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { ConvexHttpClient } from "convex/browser";
import type { NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import {
	normalizeClerkUserPayload,
	shouldSkipWebhookEvent,
} from "@/lib/clerk-webhook";

export const runtime = "nodejs";

const UPSERT_USER = api.users.upsertUser;

export async function POST(req: NextRequest) {
	const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		return new Response("Convex URL not configured", { status: 500 });
	}
	let event: Awaited<ReturnType<typeof verifyWebhook>>;
	try {
		event = await verifyWebhook(req);
	} catch {
		return new Response("Invalid webhook signature", { status: 400 });
	}

	const eventId = req.headers.get("svix-id");
	if (eventId && shouldSkipWebhookEvent(eventId)) {
		return new Response("Duplicate event", { status: 200 });
	}

	if (event.type === "user.created" || event.type === "user.updated") {
		const convex = new ConvexHttpClient(convexUrl);
		const payload = normalizeClerkUserPayload(
			event.data as unknown as Record<string, unknown>,
		);
		await convex.mutation(UPSERT_USER, payload);
	}

	return new Response("OK", { status: 200 });
}
