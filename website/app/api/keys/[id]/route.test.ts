import { describe, expect, test } from "bun:test";
import { createKeyByIdDeleteHandler } from "./handlers";

describe("DELETE /api/keys/[id]", () => {
	test("returns 504 when Clerk key lookup times out", async () => {
		const handler = createKeyByIdDeleteHandler({
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
			new Request("https://app.bardo.ai/api/keys/key_123"),
			{
				params: Promise.resolve({ id: "key_123" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(504);
		expect(body.error).toContain("Key lookup timed out");
	});

	test("returns 504 when Clerk key deletion times out", async () => {
		const handler = createKeyByIdDeleteHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						get: async () => ({
							id: "key_123",
							subject: "user_123",
						}),
						delete: async () =>
							new Promise((_resolve, reject) => {
								setTimeout(
									() =>
										reject(
											new Error("clerk.apiKeys.delete timed out after 5ms"),
										),
									0,
								);
							}),
					},
				}) as never,
			timeoutMs: 5,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys/key_123"),
			{
				params: Promise.resolve({ id: "key_123" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(504);
		expect(body.error).toContain("Key deletion timed out");
	});

	test("returns 502 when Clerk key lookup fails for a non-timeout upstream error", async () => {
		const handler = createKeyByIdDeleteHandler({
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
			new Request("https://app.bardo.ai/api/keys/key_123"),
			{
				params: Promise.resolve({ id: "key_123" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(502);
		expect(body.error).toContain("Key lookup failed");
	});

	test("returns 502 when Clerk key deletion fails for a non-timeout upstream error", async () => {
		const handler = createKeyByIdDeleteHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						get: async () => ({
							id: "key_123",
							subject: "user_123",
						}),
						delete: async () => {
							throw new Error("upstream delete failure");
						},
					},
				}) as never,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys/key_123"),
			{
				params: Promise.resolve({ id: "key_123" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(502);
		expect(body.error).toContain("Key deletion failed");
	});
});
