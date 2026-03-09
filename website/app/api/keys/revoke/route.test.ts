import { describe, expect, test } from "bun:test";
import { createKeysRevokePostHandler } from "./handlers";

describe("POST /api/keys/revoke", () => {
	test("returns 504 when Clerk key lookup times out", async () => {
		const handler = createKeysRevokePostHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						get: async () =>
							new Promise((_resolve, reject) => {
								setTimeout(
									() =>
										reject(new Error("clerk.apiKeys.get timed out after 5ms")),
									0,
								);
							}),
						delete: async () => undefined,
					},
				}) as never,
			timeoutMs: 5,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys/revoke", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "key_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(504);
		expect(body.error).toContain("Key lookup timed out");
	});

	test("returns 404 when the key does not belong to the current user", async () => {
		const handler = createKeysRevokePostHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						get: async () => ({
							id: "key_123",
							subject: "user_other",
						}),
						delete: async () => {
							throw new Error("should not delete foreign key");
						},
					},
				}) as never,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys/revoke", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "key_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe("Not found");
	});

	test("returns 502 when Clerk key lookup fails for a non-timeout upstream error", async () => {
		const handler = createKeysRevokePostHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						get: async () => {
							throw new Error("upstream lookup failure");
						},
						delete: async () => undefined,
					},
				}) as never,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys/revoke", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ id: "key_123" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(502);
		expect(body.error).toContain("Key lookup failed");
	});
});
