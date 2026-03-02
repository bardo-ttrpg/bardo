import { describe, expect, mock, test } from "bun:test";
import {
	isClerkMiddlewareDetectionError,
	resolveRouteUserId,
} from "./clerk-route-auth";

describe("isClerkMiddlewareDetectionError", () => {
	test("detects the Clerk middleware guidance error", () => {
		expect(
			isClerkMiddlewareDetectionError(
				new Error(
					"Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware().",
				),
			),
		).toBe(true);
	});

	test("ignores unrelated errors", () => {
		expect(isClerkMiddlewareDetectionError(new Error("boom"))).toBe(false);
	});
});

describe("resolveRouteUserId", () => {
	test("returns the user id when auth succeeds", async () => {
		const result = await resolveRouteUserId("/api/billing", {
			authFn: (async () => ({
				userId: "user_123",
			})) as typeof import("@clerk/nextjs/server").auth,
		});

		expect(result).toEqual({ userId: "user_123" });
	});

	test("returns a 503 response for Clerk middleware detection errors", async () => {
		const warn = mock(() => {});

		const result = await resolveRouteUserId("/api/billing", {
			authFn: (async () => {
				throw new Error(
					"Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware().",
				);
			}) as typeof import("@clerk/nextjs/server").auth,
			logger: { warn },
		});

		expect(result.userId).toBeNull();
		expect(result.response?.status).toBe(503);
		expect(await result.response?.json()).toEqual({
			error:
				"Authentication middleware unavailable. Retry after the app proxy initializes.",
		});
		expect(warn).toHaveBeenCalledWith("website.auth.middleware_unavailable", {
			"bardo.service": "website",
			"bardo.route": "/api/billing",
			"bardo.operation": "clerk.auth",
		});
	});
});
