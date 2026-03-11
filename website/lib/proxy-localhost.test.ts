import { describe, expect, test } from "bun:test";
import { resolveProxyLocalhostRedirectTarget } from "./proxy-localhost";

describe("resolveProxyLocalhostRedirectTarget", () => {
	test("prefers the browser-visible request url host for localhost matching", () => {
		expect(
			resolveProxyLocalhostRedirectTarget({
				forwardedHostHeader: "127.0.0.1:3001",
				hostHeader: "127.0.0.1:3001",
				requestUrl: "http://localhost:3001/",
				nextUrlHost: "localhost:3001",
				appUrl: "http://localhost:3001",
			}),
		).toBeNull();
	});

	test("still redirects when the browser-visible host differs from the canonical localhost", () => {
		expect(
			resolveProxyLocalhostRedirectTarget({
				forwardedHostHeader: "localhost:3001",
				hostHeader: "localhost:3001",
				requestUrl: "http://127.0.0.1:3001/",
				nextUrlHost: "127.0.0.1:3001",
				appUrl: "http://localhost:3001",
			}),
		).toBe("localhost");
	});
});
