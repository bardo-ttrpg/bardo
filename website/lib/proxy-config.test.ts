import { describe, expect, test } from "bun:test";
import {
	API_PROXY_MATCHER,
	PAGE_PROXY_MATCHER,
	PAGE_PROXY_MATCHER_SOURCE,
	shouldUseClerkOnlyProxyPathname,
} from "./proxy-config";

describe("proxy config", () => {
	test("excludes api and Next static assets from the page proxy matcher", () => {
		expect(PAGE_PROXY_MATCHER_SOURCE).toContain("api");
		expect(PAGE_PROXY_MATCHER_SOURCE).toContain("_next/static");
		expect(PAGE_PROXY_MATCHER_SOURCE).toContain("_next/image");
		expect(PAGE_PROXY_MATCHER_SOURCE).toContain("favicon.ico");
	});

	test("skips router prefetch requests", () => {
		expect(PAGE_PROXY_MATCHER.missing).toEqual([
			{ type: "header", key: "next-router-prefetch" },
			{ type: "header", key: "purpose", value: "prefetch" },
		]);
	});

	test("keeps api and trpc routes inside the Clerk middleware matcher", () => {
		expect(API_PROXY_MATCHER).toBe("/(api|trpc)(.*)");
	});

	test("uses the Clerk-only fast path for api and trpc routes", () => {
		expect(shouldUseClerkOnlyProxyPathname("/api/billing")).toBe(true);
		expect(shouldUseClerkOnlyProxyPathname("/trpc/health")).toBe(true);
		expect(shouldUseClerkOnlyProxyPathname("/pricing")).toBe(false);
	});
});
