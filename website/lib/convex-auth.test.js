import { describe, expect, test } from "bun:test";
import { clerkIdFromIdentity } from "./convex-auth";

describe("clerkIdFromIdentity", () => {
	test("returns null for unauthenticated identity", () => {
		expect(clerkIdFromIdentity(null)).toBeNull();
	});

	test("returns subject when identity contains subject", () => {
		expect(clerkIdFromIdentity({ subject: "user_123" })).toBe("user_123");
	});
});
