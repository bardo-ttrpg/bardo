import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const proxySource = readFileSync(new URL("./proxy.ts", import.meta.url), "utf8");

describe("website proxy", () => {
	test("redirects signed-out protected routes to sign-in instead of hiding them behind a 404", () => {
		expect(proxySource).toContain("redirectToSignIn");
		expect(proxySource).toContain("returnBackUrl: req.url");
		expect(proxySource).not.toContain("await auth.protect()");
	});
});
