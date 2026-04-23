import { describe, expect, test } from "bun:test";
import { createConnectTelemetry } from "../../../../lib/connect-telemetry";
import { createRuntimeStatusGetHandler } from "./handlers";

describe("GET /api/connect/runtime-status", () => {
	test("returns 429 with rate-limit headers when runtime status budget is exhausted", async () => {
		const handler = createRuntimeStatusGetHandler({
			consumeBudget: async () => ({
				allowed: false,
				retryAfterSeconds: 30,
				limit: 120,
				remaining: 0,
				resetEpochSeconds: 1_800_000_030,
			}),
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bardo_live_test",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(429);
		expect(body.error).toContain("Too many runtime status requests");
		expect(response.headers.get("retry-after")).toBe("30");
		expect(response.headers.get("x-ratelimit-limit")).toBe("120");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000030");
	});

	test("returns the plan, scopes, and workspace path for a valid direct credential", async () => {
		const handler = createRuntimeStatusGetHandler({
			consumeBudget: async () => ({
				allowed: true,
				retryAfterSeconds: 60,
				limit: 120,
				remaining: 119,
				resetEpochSeconds: 1_800_000_000,
			}),
			createClerkClient: async () => ({
				apiKeys: {
					verify: async (secret: string) => {
						expect(secret).toBe("bardo_live_test");
						return {
							id: "key_123",
							subject: "user_123",
							scopes: ["mcp"],
							claims: {
								workspacePath: "./customers/user_123",
							},
						};
					},
				},
			}),
			resolvePlanForSubject: async (_clerk, subject) => {
				expect(subject).toBe("user_123");
				return {
					plan: "pro",
					billingUnavailable: false,
				};
			},
			mcpPeriodLimitResolver: (plan) => {
				expect(plan).toBe("pro");
				return 25_000;
			},
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bardo_live_test",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(response.headers.get("x-ratelimit-limit")).toBe("120");
		expect(response.headers.get("x-ratelimit-remaining")).toBe("119");
		expect(response.headers.get("x-ratelimit-reset")).toBe("1800000000");
		expect(body).toEqual({
			valid: true,
			subjectId: "user_123",
			keyId: "key_123",
			scopes: ["mcp"],
			workspacePath: "./customers/user_123",
			plan: "pro",
			mcpPeriodLimit: 25_000,
			billingUnavailable: false,
		});
	});

	test("accepts a bridge access token and rechecks paid plan access", async () => {
		const handler = createRuntimeStatusGetHandler({
			consumeBudget: async () => ({
				allowed: true,
				retryAfterSeconds: 60,
				limit: 120,
				remaining: 119,
				resetEpochSeconds: 1_800_000_000,
			}),
			decodeBridgeToken: async (token) => {
				expect(token).toBe("bridge_access_token");
				return {
					sessionId: "bridge_session_123",
					userId: "user_123",
					plan: "pro",
					accountLabel: "Armando",
				};
			},
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						throw new Error("should not verify Clerk API keys");
					},
				},
			}),
			resolvePlanForSubject: async (_clerk, subject) => {
				expect(subject).toBe("user_123");
				return {
					plan: "pro",
					billingUnavailable: false,
				};
			},
			mcpPeriodLimitResolver: () => 25_000,
		});

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bridge_access_token",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			valid: true,
			subjectId: "user_123",
			keyId: "bridge:bridge_session_123",
			scopes: ["mcp"],
			workspacePath: null,
			plan: "pro",
			mcpPeriodLimit: 25_000,
			billingUnavailable: false,
		});
	});

	test("rejects requests without a bridge credential", async () => {
		const handler = createRuntimeStatusGetHandler();

		const response = await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status"),
		);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toContain("bridge credential");
	});

	test("records runtime status success and invalid-key outcomes in connect telemetry", async () => {
		const telemetry = createConnectTelemetry();
		const handler = createRuntimeStatusGetHandler({
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async (secret: string) => {
						if (secret === "bad-key") {
							const error = new Error("Invalid") as Error & {
								status: number;
							};
							error.status = 401;
							throw error;
						}
						return {
							id: "key_123",
							subject: "user_123",
							scopes: ["mcp"],
							claims: {
								workspacePath: "./customers/user_123",
							},
						};
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "pro",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 25_000,
		});

		await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer good-key",
				},
			}),
		);
		await handler(
			new Request("https://app.bardo.ai/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer bad-key",
				},
			}),
		);

		expect(telemetry.snapshot().runtime_status_success).toBe(1);
		expect(telemetry.snapshot().runtime_status_invalid).toBe(1);
	});

	test("normalizes not-found key verification failures into a clean invalid credential response", async () => {
		const handler = createRuntimeStatusGetHandler({
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						const error = new Error("Not Found") as Error & {
							status: number;
						};
						error.status = 404;
						throw error;
					},
				},
			}),
		});

		const response = await handler(
			new Request("https://www.bardo.gg/api/connect/runtime-status", {
				headers: {
					authorization: "Bearer missing-key",
				},
			}),
		);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe("Invalid bridge credential.");
	});
});
