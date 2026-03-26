import { describe, expect, test } from "bun:test";
import {
	shouldRunClerkForPagePathname,
	shouldUseClerkOnlyProxyPathname,
} from "./proxy-config";

describe("shouldUseClerkOnlyProxyPathname", () => {
	test("keeps API and trpc requests on the clerk-only proxy path", () => {
		expect(shouldUseClerkOnlyProxyPathname("/api")).toBe(true);
		expect(shouldUseClerkOnlyProxyPathname("/api/connect/runtime-status")).toBe(
			true,
		);
		expect(shouldUseClerkOnlyProxyPathname("/trpc")).toBe(true);
		expect(shouldUseClerkOnlyProxyPathname("/trpc/example")).toBe(true);
		expect(shouldUseClerkOnlyProxyPathname("/pricing")).toBe(false);
	});
});

describe("shouldRunClerkForPagePathname", () => {
	test("runs Clerk on auth-aware routes only", () => {
		expect(shouldRunClerkForPagePathname("/dashboard")).toBe(true);
		expect(shouldRunClerkForPagePathname("/dashboard/connect/bridge/abc")).toBe(
			true,
		);
		expect(shouldRunClerkForPagePathname("/pricing")).toBe(false);
		expect(shouldRunClerkForPagePathname("/sign-in")).toBe(true);
		expect(shouldRunClerkForPagePathname("/sign-up")).toBe(true);
		expect(shouldRunClerkForPagePathname("/")).toBe(false);
		expect(shouldRunClerkForPagePathname("/docs/install")).toBe(false);
		expect(shouldRunClerkForPagePathname("/legal/privacy")).toBe(false);
	});
});
