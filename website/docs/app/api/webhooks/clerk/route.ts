import { Webhook } from "svix";
import { headers } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(
	process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
);

const UPSERT_USER = api.users.upsertUser as Parameters<
	ConvexHttpClient["mutation"]
>[0];

export async function POST(req: Request) {
	const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
	if (!webhookSecret) {
		return new Response("Webhook secret not configured", { status: 500 });
	}

	const headerPayload = await headers();
	const svixId = headerPayload.get("svix-id");
	const svixTimestamp = headerPayload.get("svix-timestamp");
	const svixSignature = headerPayload.get("svix-signature");

	if (!svixId || !svixTimestamp || !svixSignature) {
		return new Response("Missing svix headers", { status: 400 });
	}

	const payload = await req.text();
	const wh = new Webhook(webhookSecret);

	let event: { type: string; data: Record<string, unknown> };
	try {
		event = wh.verify(payload, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		}) as typeof event;
	} catch {
		return new Response("Invalid webhook signature", { status: 400 });
	}

	if (event.type === "user.created" || event.type === "user.updated") {
		const data = event.data;
		const emailAddresses = data.email_addresses as Array<{
			id: string;
			email_address: string;
		}>;
		const primaryEmailId = data.primary_email_address_id as string | null;
		const primaryEmail = primaryEmailId
			? (emailAddresses?.find((e) => e.id === primaryEmailId)
					?.email_address ?? null)
			: null;

		await convex.mutation(UPSERT_USER, {
			clerkId: data.id as string,
			email: primaryEmail,
			imageUrl: (data.image_url as string | null) ?? null,
			name:
				[data.first_name as string, data.last_name as string]
					.filter(Boolean)
					.join(" ")
					.trim() || null,
		});
	}

	return new Response("OK", { status: 200 });
}
