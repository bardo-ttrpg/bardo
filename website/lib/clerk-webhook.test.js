import { describe, expect, test } from "bun:test";
import { normalizeClerkUserPayload } from "./clerk-webhook";

describe("normalizeClerkUserPayload", () => {
	test("extracts clerk identity and primary email", () => {
		const payload = normalizeClerkUserPayload({
			id: "user_123",
			first_name: "Armando",
			last_name: "Andre",
			image_url: "https://img.example.com/a.png",
			primary_email_address_id: "e2",
			email_addresses: [
				{ id: "e1", email_address: "other@example.com" },
				{ id: "e2", email_address: "primary@example.com" },
			],
		});

		expect(payload).toEqual({
			clerkId: "user_123",
			email: "primary@example.com",
			imageUrl: "https://img.example.com/a.png",
			name: "Armando Andre",
		});
	});

	test("returns null email and name when missing in payload", () => {
		const payload = normalizeClerkUserPayload({
			id: "user_123",
			first_name: "",
			last_name: "",
			image_url: null,
			primary_email_address_id: null,
			email_addresses: [],
		});

		expect(payload).toEqual({
			clerkId: "user_123",
			email: null,
			imageUrl: null,
			name: null,
		});
	});
});
