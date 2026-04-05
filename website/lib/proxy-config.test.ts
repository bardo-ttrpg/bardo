import { describe, expect, test } from "bun:test";
import {
	shouldRedirectLegacyMcpHost,
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
		expect(shouldUseClerkOnlyProxyPathname("/blog")).toBe(false);
	});
});

describe("shouldRunClerkForPagePathname", () => {
	test("runs Clerk on auth-aware routes only", () => {
		expect(shouldRunClerkForPagePathname("/")).toBe(true);
		expect(shouldRunClerkForPagePathname("/dashboard")).toBe(true);
		expect(shouldRunClerkForPagePathname("/dashboard/connect/bridge/abc")).toBe(
			true,
		);
		expect(shouldRunClerkForPagePathname("/blog")).toBe(false);
		expect(shouldRunClerkForPagePathname("/sign-in")).toBe(true);
		expect(shouldRunClerkForPagePathname("/sign-up")).toBe(true);
		expect(shouldRunClerkForPagePathname("/forgot-password")).toBe(true);
		expect(shouldRunClerkForPagePathname("/docs/install")).toBe(false);
		expect(shouldRunClerkForPagePathname("/legal/privacy")).toBe(false);
	});
});

describe("shouldRedirectLegacyMcpHost", () => {
	test("matches the legacy hosted MCP domain on host headers", () => {
		expect(
			shouldRedirectLegacyMcpHost({ hostHeader: "mcp.bardo.gg" }),
		).toBe(true);
		expect(
			shouldRedirectLegacyMcpHost({
				forwardedHostHeader: "mcp.bardo.gg",
			}),
		).toBe(true);
		expect(
			shouldRedirectLegacyMcpHost({
				hostHeader: "MCP.BARDO.GG:443",
			}),
		).toBe(true);
	});

	test("ignores the public website host", () => {
		expect(
			shouldRedirectLegacyMcpHost({ hostHeader: "www.bardo.gg" }),
		).toBe(false);
		expect(
			shouldRedirectLegacyMcpHost({ forwardedHostHeader: "bardo.gg" }),
		).toBe(false);
	});
});
