import { describe, expect, test } from "bun:test";
import {
	ApiKeyCreationPolicyError,
	assertApiKeyCreationAllowed,
} from "./api-key-creation-policy";

describe("assertApiKeyCreationAllowed", () => {
	test("throws 503 when billing is unavailable", async () => {
		let listed = false;
		const clerk = {
			apiKeys: {
				list: async () => {
					listed = true;
					return { totalCount: 0 };
				},
			},
		};

		await expect(
			assertApiKeyCreationAllowed({
				clerk: clerk as never,
				userId: "user_123",
				fetchLiveBilling: async () => ({
					billingUnavailable: true,
					plan: "free",
					periodStart: 1,
				}),
			}),
		).rejects.toBeInstanceOf(ApiKeyCreationPolicyError);

		await expect(
			assertApiKeyCreationAllowed({
				clerk: clerk as never,
				userId: "user_123",
				fetchLiveBilling: async () => ({
					billingUnavailable: true,
					plan: "free",
					periodStart: 1,
				}),
			}),
		).rejects.toMatchObject({
			status: 503,
			message: "Billing service unavailable, please try again",
		});
		expect(listed).toBe(false);
	});

	test("throws 403 when the key limit is reached", async () => {
		const clerk = {
			apiKeys: {
				list: async (args: Record<string, unknown>) => {
					expect(args).toEqual({ subject: "user_123", limit: 1 });
					return { totalCount: 1 };
				},
			},
		};

		await expect(
			assertApiKeyCreationAllowed({
				clerk: clerk as never,
				userId: "user_123",
				fetchLiveBilling: async () => ({
					billingUnavailable: false,
					plan: "free",
					periodStart: 1,
				}),
			}),
		).rejects.toMatchObject({
			status: 403,
			message: "API key limit reached for your plan",
		});
	});

	test("allows key creation when under the plan limit", async () => {
		const clerk = {
			apiKeys: {
				list: async (args: Record<string, unknown>) => {
					expect(args).toEqual({ subject: "user_123", limit: 1 });
					return { totalCount: 4 };
				},
			},
		};

		await expect(
			assertApiKeyCreationAllowed({
				clerk: clerk as never,
				userId: "user_123",
				fetchLiveBilling: async () => ({
					billingUnavailable: false,
					plan: "solo",
					periodStart: 1,
				}),
			}),
		).resolves.toBeUndefined();
	});
});
