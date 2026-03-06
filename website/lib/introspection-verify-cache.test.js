import { describe, expect, test } from "bun:test";
import { createIntrospectionVerifyCache } from "./introspection-verify-cache";

describe("createIntrospectionVerifyCache", () => {
	test("returns cached valid payload until ttl expires", () => {
		let now = Date.UTC(2026, 1, 27, 10, 0, 0);
		const cache = createIntrospectionVerifyCache({
			nowMs: () => now,
			validTtlMs: 1_000,
			invalidTtlMs: 250,
		});

		cache.setValid("ak_test", {
			subjectId: "user_123",
			keyId: "key_123",
			plan: "solo",
			scopes: ["mcp"],
			workspacePath: "./customers/user_123",
		});

		const hit = cache.get("ak_test");
		expect(hit).toEqual({
			kind: "valid",
			value: {
				subjectId: "user_123",
				keyId: "key_123",
				plan: "solo",
				scopes: ["mcp"],
				workspacePath: "./customers/user_123",
				billingUnavailable: false,
			},
		});

		now += 1_001;
		expect(cache.get("ak_test")).toBeNull();
	});

	test("returns cached invalid marker until ttl expires", () => {
		let now = Date.UTC(2026, 1, 27, 10, 0, 0);
		const cache = createIntrospectionVerifyCache({
			nowMs: () => now,
			validTtlMs: 1_000,
			invalidTtlMs: 200,
		});

		cache.setInvalid("ak_invalid");
		expect(cache.get("ak_invalid")).toEqual({ kind: "invalid" });

		now += 250;
		expect(cache.get("ak_invalid")).toBeNull();
	});
});
