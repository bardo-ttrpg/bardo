import { expect, test } from "bun:test";
import {
	resolveCanonicalLocalhost,
	shouldRedirectToCanonicalLocalhost,
} from "./local-domain";

test("keeps localhost host unchanged", () => {
	expect(
		resolveCanonicalLocalhost({
			requestHostname: "localhost",
			appUrl: "http://localhost:3001",
		}),
	).toBeNull();
});

test("redirects loopback host to localhost by default", () => {
	expect(
		resolveCanonicalLocalhost({
			requestHostname: "127.0.0.1",
			appUrl: null,
		}),
	).toBe("localhost");
});

test("prefers app URL local host as canonical target", () => {
	expect(
		resolveCanonicalLocalhost({
			requestHostname: "localhost",
			appUrl: "http://127.0.0.1:3001",
		}),
	).toBe("127.0.0.1");
});

test("does not redirect non-local hosts", () => {
	expect(
		resolveCanonicalLocalhost({
			requestHostname: "example.com",
			appUrl: "http://localhost:3001",
		}),
	).toBeNull();
});

test("skips redirect when request URL is already canonical host", () => {
	expect(
		shouldRedirectToCanonicalLocalhost({
			requestHostname: "127.0.0.1",
			requestUrlHostname: "localhost",
			appUrl: "http://localhost:3001",
		}),
	).toBeNull();
});

test("redirects when request URL host and canonical host differ", () => {
	expect(
		shouldRedirectToCanonicalLocalhost({
			requestHostname: "127.0.0.1",
			requestUrlHostname: "127.0.0.1",
			appUrl: "http://localhost:3001",
		}),
	).toBe("localhost");
});
