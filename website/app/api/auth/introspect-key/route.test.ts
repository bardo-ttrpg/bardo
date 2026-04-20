import { describe, expect, mock, test } from "bun:test";
import { createIntrospectionTelemetry } from "../../../../lib/introspection-telemetry";
import { createIntrospectionVerifyCache } from "../../../../lib/introspection-verify-cache";
import type { PlanTier } from "../../../../lib/user-billing";
import { createIntrospectPostHandler } from "./handlers";

function buildRequest(secret: string, apiKey: string): Request {
	return new Request("http://localhost:3001/api/auth/introspect-key", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-bardo-introspection-token": secret,
		},
		body: JSON.stringify({
			apiKey,
			requiredScope: "mcp",
		}),
	});
}

function buildBridgeRequest(secret: string, apiKey: string): Request {
	return new Request("http://localhost:3001/api/auth/introspect-key", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-bardo-introspection-token": secret,
		},
		body: JSON.stringify({
			apiKey,
			requiredScope: "mcp",
			workspaceRoot: "/tmp/campaign-alpha",
		}),
	});
}

describe("POST /api/auth/introspect-key", () => {
	test("rejects unauthorized requests before reading the request body", async () => {
		let jsonCalled = false;
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 10_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => {
					throw new Error(
						"consumePreAuthKey should not run for unauthorized requests",
					);
				},
				consumeUser: async () => {
					throw new Error(
						"consumeUser should not run for unauthorized requests",
					);
				},
				consumeKey: async () => {
					throw new Error(
						"consumeKey should not run for unauthorized requests",
					);
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						throw new Error(
							"Clerk verification should not run for unauthorized requests",
						);
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
		});

		const response = await handler({
			headers: new Headers({
				"content-type": "application/json",
				"x-bardo-introspection-token": "wrong-secret",
			}),
			json: async () => {
				jsonCalled = true;
				return {
					apiKey: "ak_test_unauthorized",
					requiredScope: "mcp",
				};
			},
		} as unknown as Request);

		expect(response.status).toBe(401);
		expect(jsonCalled).toBe(false);
	});

	test("uses verify cache on second call and avoids repeated Clerk verification", async () => {
		let verifyCalls = 0;
		let consumeKeyCalls = 0;
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 10_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			allowWorkspaceRootOverrideEnv: "false",
			verificationLimiter: {
				consumePreAuthKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
				consumeUser: async () => {
					throw new Error("consumeUser should not be called for null subject");
				},
				consumeKey: async () => {
					consumeKeyCalls += 1;
					return {
						allowed: true,
						limit: 500,
						used: 1,
						remaining: 499,
						backend: "memory",
					};
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						verifyCalls += 1;
						return {
							id: "key_1",
							claims: { workspacePath: "./customers/user_1" },
							scopes: ["mcp"],
						};
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
		});

		const firstResponse = await handler(
			buildRequest("shared-secret", "ak_test_cache_valid"),
		);
		const secondResponse = await handler(
			buildRequest("shared-secret", "ak_test_cache_valid"),
		);
		const firstBody = await firstResponse.json();
		const secondBody = await secondResponse.json();

		expect(firstBody.valid).toBe(true);
		expect(secondBody.valid).toBe(true);
		expect(secondBody.verification.cached).toBe(true);
		expect(verifyCalls).toBe(1);
		expect(consumeKeyCalls).toBe(1);
		expect(telemetry.snapshot()).toEqual({
			cache_hit_valid: 1,
			cache_hit_invalid: 0,
			clerk_verify_called: 1,
			clerk_verify_invalid: 0,
			budget_block_user: 0,
			budget_block_key: 0,
			success: 2,
		});
	});

	test("uses the high-water pre-auth budget tier before key verification", async () => {
		let seenPreAuthPlan: PlanTier | null = null;
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 10_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async (_secretHash, plan) => {
					seenPreAuthPlan = plan ?? null;
					return {
						allowed: true,
						limit: 3_000,
						used: 1,
						remaining: 2_999,
						backend: "memory",
					};
				},
				consumeUser: async (_subject, plan) => ({
					allowed: true,
					limit: plan === "solo" ? 7_500 : 500,
					used: 1,
					remaining: 7_499,
					backend: "memory",
				}),
				consumeKey: async (_keyId, plan) => ({
					allowed: true,
					limit: plan === "solo" ? 2_000 : 500,
					used: 1,
					remaining: 1_999,
					backend: "memory",
				}),
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => ({
						id: "key_solo",
						subject: "user_solo",
						claims: { workspacePath: "./customers/user_solo" },
						scopes: ["mcp"],
					}),
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "solo",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 25_000,
		});

		const response = await handler(
			buildRequest("shared-secret", "ak_test_preauth_plan"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.valid).toBe(true);
		expect(seenPreAuthPlan === "solo").toBe(true);
	});

	test("caches invalid verification errors and short-circuits repeat calls", async () => {
		let verifyCalls = 0;
		const logWarn = mock(() => {});
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 60_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
				consumeUser: async () => {
					throw new Error("consumeUser should not run for invalid key");
				},
				consumeKey: async () => {
					throw new Error("consumeKey should not run for invalid key");
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						verifyCalls += 1;
						throw { status: 401 };
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
			tracing: {
				withRequestSpan: (_args, callback) => callback({ setAttribute() {} }),
				withClerkVerifySpan: (callback) => callback(),
				withPlanLookupSpan: (callback) => callback(),
				captureException: () => {},
				logInfo: () => {},
				logWarn,
				logError: () => {},
			},
		});

		const firstResponse = await handler(
			buildRequest("shared-secret", "ak_test_cache_invalid"),
		);
		const secondResponse = await handler(
			buildRequest("shared-secret", "ak_test_cache_invalid"),
		);
		const firstBody = await firstResponse.json();
		const secondBody = await secondResponse.json();

		expect(firstBody.valid).toBe(false);
		expect(secondBody).toEqual({
			valid: false,
			reason: "cached_invalid_api_key",
		});
		expect(logWarn).toHaveBeenCalledWith(
			"bardo.auth_introspection.invalid_key",
			expect.objectContaining({
				"bardo.result": "invalid",
				"bardo.introspection.pre_auth_backend": "memory",
			}),
		);
		expect(verifyCalls).toBe(1);
		expect(telemetry.snapshot()).toEqual({
			cache_hit_valid: 0,
			cache_hit_invalid: 1,
			clerk_verify_called: 1,
			clerk_verify_invalid: 1,
			budget_block_user: 0,
			budget_block_key: 0,
			success: 0,
		});
	});

	test("preserves website backend labels when invalid keys are rejected", async () => {
		const logWarn = mock(() => {});
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 60_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "website",
				}),
				consumeUser: async () => {
					throw new Error("consumeUser should not run for invalid key");
				},
				consumeKey: async () => {
					throw new Error("consumeKey should not run for invalid key");
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						throw { status: 404 };
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
			tracing: {
				withRequestSpan: (_args, callback) => callback({ setAttribute() {} }),
				withClerkVerifySpan: (callback) => callback(),
				withPlanLookupSpan: (callback) => callback(),
				captureException: () => {},
				logInfo: () => {},
				logWarn,
				logError: () => {},
			},
		});

		const response = await handler(
			buildRequest("shared-secret", "ak_test_website_backend_invalid"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.valid).toBe(false);
		expect(logWarn).toHaveBeenCalledWith(
			"bardo.auth_introspection.invalid_key",
			expect.objectContaining({
				"bardo.result": "invalid",
				"bardo.introspection.pre_auth_backend": "website",
				"http.status_code": 404,
			}),
		);
	});

	test("caches budget-denied keys and prevents repeated paid verification", async () => {
		let verifyCalls = 0;
		let consumeKeyCalls = 0;
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 60_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
				consumeUser: async () => {
					throw new Error("consumeUser should not be called for null subject");
				},
				consumeKey: async () => {
					consumeKeyCalls += 1;
					return {
						allowed: false,
						limit: 500,
						used: 500,
						remaining: 0,
						backend: "memory",
					};
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						verifyCalls += 1;
						return {
							id: "key_budget_1",
							claims: { workspacePath: "./customers/user_budget" },
							scopes: ["mcp"],
						};
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
		});

		const firstResponse = await handler(
			buildRequest("shared-secret", "ak_test_budget_denied"),
		);
		const secondResponse = await handler(
			buildRequest("shared-secret", "ak_test_budget_denied"),
		);
		const firstBody = await firstResponse.json();
		const secondBody = await secondResponse.json();

		expect(firstBody.reason).toBe("daily_key_verification_limit_reached");
		expect(secondBody.reason).toBe("cached_invalid_api_key");
		expect(verifyCalls).toBe(1);
		expect(consumeKeyCalls).toBe(1);
		expect(telemetry.snapshot()).toEqual({
			cache_hit_valid: 0,
			cache_hit_invalid: 1,
			clerk_verify_called: 1,
			clerk_verify_invalid: 0,
			budget_block_user: 0,
			budget_block_key: 1,
			success: 0,
		});
	});

	test("blocks repeated secret abuse before Clerk verification when preliminary key budget is exhausted", async () => {
		let verifyCalls = 0;
		let consumePreAuthCalls = 0;
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 60_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => {
					consumePreAuthCalls += 1;
					return {
						allowed: false,
						limit: 500,
						used: 500,
						remaining: 0,
						backend: "memory",
					};
				},
				consumeUser: async () => {
					throw new Error(
						"consumeUser should not run when preauth budget is blocked",
					);
				},
				consumeKey: async () => {
					throw new Error(
						"consumeKey should not run when preauth budget is blocked",
					);
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => {
						verifyCalls += 1;
						return {
							id: "key_preauth_1",
							claims: { workspacePath: "./customers/user_preauth" },
							scopes: ["mcp"],
						};
					},
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: "free",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 100,
		});

		const response = await handler(
			buildRequest("shared-secret", "ak_test_preauth_denied"),
		);
		const body = await response.json();

		expect(body.reason).toBe("daily_key_verification_limit_reached");
		expect(consumePreAuthCalls).toBe(1);
		expect(verifyCalls).toBe(0);
		expect(telemetry.snapshot()).toEqual({
			cache_hit_valid: 0,
			cache_hit_invalid: 0,
			clerk_verify_called: 0,
			clerk_verify_invalid: 0,
			budget_block_user: 0,
			budget_block_key: 1,
			success: 0,
		});
	});

	test("signals billing degradation and enforces free-tier limits when billing is unavailable", async () => {
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 10_000,
		});
		const seenPlans: string[] = [];

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
				consumeUser: async (_subject, plan) => {
					seenPlans.push(plan);
					return {
						allowed: true,
						limit: 500,
						used: 1,
						remaining: 499,
						backend: "memory",
					};
				},
				consumeKey: async (_keyId, plan) => {
					seenPlans.push(plan);
					return {
						allowed: true,
						limit: 500,
						used: 1,
						remaining: 499,
						backend: "memory",
					};
				},
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			createClerkClient: async () => ({
				apiKeys: {
					verify: async () => ({
						id: "key_billing_unavailable",
						subject: "user_billing_unavailable",
						claims: { workspacePath: "./customers/user_billing_unavailable" },
						scopes: ["mcp"],
					}),
				},
			}),
			resolvePlanForSubject: async () => ({
				plan: null,
				billingUnavailable: true,
			}),
			mcpPeriodLimitResolver: (plan) => (plan === "free" ? 100 : 25_000),
		});

		const response = await handler(
			buildRequest("shared-secret", "ak_test_billing_unavailable"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.valid).toBe(true);
		expect(body.plan).toBe("free");
		expect(body.billingUnavailable).toBe(true);
		expect(body.mcpPeriodLimit).toBe(100);
		expect(seenPlans).toEqual(["free", "free"]);
	});

	test("accepts a bridge token and requires a local workspace root", async () => {
		const telemetry = createIntrospectionTelemetry({ logEnabled: false });
		const cache = createIntrospectionVerifyCache({
			validTtlMs: 60_000,
			invalidTtlMs: 10_000,
		});

		const handler = createIntrospectPostHandler({
			introspectionSecret: "shared-secret",
			verificationLimiter: {
				consumePreAuthKey: async () => {
					throw new Error("bridge tokens should bypass pre-auth key budget");
				},
				consumeUser: async (_subject, plan) => ({
					allowed: true,
					limit: plan === "solo" ? 500 : 100,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
				consumeKey: async () => ({
					allowed: true,
					limit: 500,
					used: 1,
					remaining: 499,
					backend: "memory",
				}),
			},
			subjectPlanCache: {
				resolve: async (_subject, lookup) => await lookup(),
			},
			introspectionVerifyCache: cache,
			telemetry,
			decodeBridgeToken: async (token) => {
				expect(token).toBe("bridge_access_token");
				return {
					sessionId: "bridge_session_123",
					userId: "user_123",
					plan: "solo",
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
			resolvePlanForSubject: async () => ({
				plan: "solo",
				billingUnavailable: false,
			}),
			mcpPeriodLimitResolver: () => 25_000,
		});

		const response = await handler(
			buildBridgeRequest("shared-secret", "bridge_access_token"),
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.valid).toBe(true);
		expect(body.campaignBasePath).toBe("/tmp/campaign-alpha");
		expect(body.keyId).toBe("bridge:bridge_session_123");
		expect(body.plan).toBe("solo");
	});
});
