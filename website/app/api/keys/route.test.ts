import { describe, expect, test } from "bun:test";
import { createKeysGetHandler, createKeysPostHandler } from "./route";

function makeKey(id: string) {
	return {
		id,
		name: `Key ${id}`,
		revoked: false,
		expired: false,
		scopes: ["mcp"],
		createdAt: 1,
		claims: { workspacePath: `./customers/user_123/${id}` },
	};
}

describe("GET /api/keys", () => {
	test("returns paginated keys with page metadata", async () => {
		const handler = createKeysGetHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						list: async (args: Record<string, unknown>) => {
							expect(args).toEqual({
								subject: "user_123",
								limit: 2,
								offset: 1,
							});
							return {
								data: [makeKey("key_2"), makeKey("key_3")],
								totalCount: 5,
							};
						},
					},
				}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: false,
				periodStart: 1,
			}),
			readKeyUsage: async () => ({
				total: 10,
				thisPeriod: 3,
				lastUsedAt: null,
				lastUsedProviderId: null,
				lastUsedModelId: null,
			}),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys?limit=2&offset=1"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.keys).toHaveLength(2);
		expect(body.page).toEqual({
			limit: 2,
			offset: 1,
			totalCount: 5,
			hasMore: true,
			nextOffset: 3,
		});
	});

	test("caps concurrent usage reads to five at a time", async () => {
		let active = 0;
		let maxActive = 0;

		const handler = createKeysGetHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						list: async () => ({
							data: Array.from({ length: 12 }, (_, index) =>
								makeKey(`key_${index + 1}`),
							),
							totalCount: 12,
						}),
					},
				}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: false,
				periodStart: 1,
			}),
			readKeyUsage: async () => {
				active += 1;
				maxActive = Math.max(maxActive, active);
				await new Promise((resolve) => setTimeout(resolve, 5));
				active -= 1;
				return {
					total: 0,
					thisPeriod: 0,
					lastUsedAt: null,
					lastUsedProviderId: null,
					lastUsedModelId: null,
				};
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys?limit=12&offset=0"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.keys).toHaveLength(12);
		expect(maxActive).toBeLessThanOrEqual(5);
	});

	test("degrades to zeroed usage fields when a key usage read fails", async () => {
		const handler = createKeysGetHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						list: async () => ({
							data: [makeKey("key_1")],
							totalCount: 1,
						}),
					},
				}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: false,
				periodStart: 1,
			}),
			readKeyUsage: async () => {
				throw new Error("usage backend unavailable");
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys?limit=20&offset=0"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.keys[0]).toMatchObject({
			callsTotal: 0,
			callsThisPeriod: 0,
			lastUsedAt: null,
			lastUsedProviderId: null,
			lastUsedModelId: null,
		});
	});
});

describe("POST /api/keys", () => {
	test("returns 503 when billing data is unavailable", async () => {
		const handler = createKeysPostHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						list: async () => {
							throw new Error("should not probe key limits");
						},
						create: async () => {
							throw new Error("should not create key");
						},
					},
				}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: true,
				plan: "free",
				periodStart: 1,
			}),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: "Primary" }),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body.error).toContain("Billing service unavailable");
	});

	test("sanitizes custom workspace paths before creating Clerk keys", async () => {
		const handler = createKeysPostHandler({
			resolveAuthState: async () => ({ userId: "user_123" }),
			createClerkClient: async () =>
				({
					apiKeys: {
						list: async () => ({ totalCount: 0 }),
						create: async (args: Record<string, unknown>) => {
							expect(args.claims).toEqual({
								workspacePath: "./customers/user_123",
							});
							return {
								id: "key_123",
								name: "Primary",
								revoked: false,
								expired: false,
								scopes: ["mcp"],
								createdAt: 1,
								secret: "secret-value",
							};
						},
					},
				}) as never,
			fetchLiveBilling: async () => ({
				billingUnavailable: false,
				plan: "solo",
				periodStart: 1,
			}),
			env: {
				BARDO_ALLOW_CUSTOM_WORKSPACE_PATH: "true",
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/keys", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Primary",
					workspacePath: "../../etc/passwd",
					scopes: ["mcp"],
				}),
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.key.workspacePath).toBe("./customers/user_123");
		expect(body.secret).toBe("secret-value");
	});
});
