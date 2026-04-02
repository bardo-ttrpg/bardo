import { describe, expect, test } from "bun:test";
import { resolveServerHostname } from "./server";

describe("resolveServerHostname", () => {
	test("binds localhost by default during development", () => {
		expect(resolveServerHostname({})).toBe("127.0.0.1");
	});

	test("honors an explicit BARDO_HOST override", () => {
		expect(resolveServerHostname({ BARDO_HOST: "0.0.0.0" })).toBe("0.0.0.0");
	});

	test("defaults to all interfaces in production", () => {
		expect(resolveServerHostname({ NODE_ENV: "production" })).toBe("0.0.0.0");
	});
});
