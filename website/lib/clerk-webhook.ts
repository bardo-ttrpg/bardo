type ClerkEmailAddress = {
	id: string;
	email_address: string;
};

type ClerkUserUpsertPayload = {
	clerkId: string;
	email: string | null;
	imageUrl: string | null;
	name: string | null;
};

const RECENT_WEBHOOK_IDS = new Map<string, number>();
const WEBHOOK_ID_TTL_MS = 5 * 60 * 1000;

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function asNullableString(value: unknown): string | null {
	return isString(value) && value.trim() ? value : null;
}

function parseEmailAddresses(value: unknown): ClerkEmailAddress[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter(
			(item): item is ClerkEmailAddress =>
				typeof item === "object" &&
				item !== null &&
				isString((item as ClerkEmailAddress).id) &&
				isString((item as ClerkEmailAddress).email_address),
		)
		.map((item) => ({
			id: item.id,
			email_address: item.email_address,
		}));
}

export function shouldSkipWebhookEvent(
	eventId: string,
	now = Date.now(),
): boolean {
	for (const [id, expiresAt] of RECENT_WEBHOOK_IDS.entries()) {
		if (expiresAt <= now) {
			RECENT_WEBHOOK_IDS.delete(id);
		}
	}

	if (RECENT_WEBHOOK_IDS.has(eventId)) {
		return true;
	}

	RECENT_WEBHOOK_IDS.set(eventId, now + WEBHOOK_ID_TTL_MS);
	return false;
}

export function normalizeClerkUserPayload(
	data: Record<string, unknown>,
): ClerkUserUpsertPayload {
	const clerkId = asNullableString(data.id);
	if (!clerkId) {
		throw new Error("Invalid Clerk payload: missing user id.");
	}

	const emailAddresses = parseEmailAddresses(data.email_addresses);
	const primaryEmailId = asNullableString(data.primary_email_address_id);
	const primaryEmail = primaryEmailId
		? (emailAddresses.find((entry) => entry.id === primaryEmailId)
				?.email_address ?? null)
		: null;

	const firstName = asNullableString(data.first_name);
	const lastName = asNullableString(data.last_name);
	const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();

	return {
		clerkId,
		email: primaryEmail,
		imageUrl: asNullableString(data.image_url),
		name: combinedName || null,
	};
}
