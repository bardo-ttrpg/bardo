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

	test("redirects raw production vercel hosts to the configured app domain", () => {
		expect(
			resolveProxyLocalhostRedirectTarget({
				forwardedHostHeader: "bardo-oldhash-armando-andre-projects.vercel.app",
				hostHeader: "bardo-oldhash-armando-andre-projects.vercel.app",
				requestUrl:
					"https://bardo-oldhash-armando-andre-projects.vercel.app/sign-in",
				nextUrlHost: "bardo-oldhash-armando-andre-projects.vercel.app",
				appUrl: "https://www.bardo.gg",
			}),
		).toBe("www.bardo.gg");
	});

	test("keeps preview-style vercel hosts when the configured app url is also on vercel", () => {
		expect(
			resolveProxyLocalhostRedirectTarget({
				forwardedHostHeader: "bardo-preview-armando-andre-projects.vercel.app",
				hostHeader: "bardo-preview-armando-andre-projects.vercel.app",
				requestUrl:
					"https://bardo-preview-armando-andre-projects.vercel.app/sign-in",
				nextUrlHost: "bardo-preview-armando-andre-projects.vercel.app",
				appUrl: "https://bardo-git-main-armando-andre-projects.vercel.app",
			}),
		).toBeNull();
	});
});
