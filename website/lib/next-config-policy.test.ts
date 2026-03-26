import { describe, expect, test } from "bun:test";
import { resolveSecurityHeaders } from "./next-config-policy";

describe("resolveSecurityHeaders", () => {
	test("treats local Next.js development as development even when production-like env vars leak in", () => {
		const headers = resolveSecurityHeaders({
			NODE_ENV: "development",
			VERCEL_ENV: "production",
		});
		const csp = headers.find(
			(header) => header.key === "Content-Security-Policy",
		);

		expect(csp?.value).toContain(
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
		);
		expect(csp?.value).toContain("worker-src 'self' blob:");
		expect(csp?.value).not.toContain("upgrade-insecure-requests");
	});

	test("keeps production CSP strict and does not allow dev-only eval or blob workers", () => {
		const headers = resolveSecurityHeaders({
			NODE_ENV: "production",
			VERCEL_ENV: "production",
		});
		const csp = headers.find(
			(header) => header.key === "Content-Security-Policy",
		);

		expect(csp?.value).toContain("script-src 'self' https:");
		expect(csp?.value).not.toContain(
			"script-src 'self' 'unsafe-inline' https:",
		);
		expect(csp?.value).not.toContain("'unsafe-eval'");
		expect(csp?.value).not.toContain("worker-src 'self' blob:");
		expect(csp?.value).toContain("upgrade-insecure-requests");
	});

	test("allows production unsafe-inline scripts only when explicitly enabled", () => {
		const headers = resolveSecurityHeaders({
			NODE_ENV: "production",
			VERCEL_ENV: "production",
			BARDO_CSP_ALLOW_UNSAFE_INLINE_SCRIPTS: "true",
		});
		const csp = headers.find(
			(header) => header.key === "Content-Security-Policy",
		);

		expect(csp?.value).toContain("script-src 'self' 'unsafe-inline' https:");
	});
});
