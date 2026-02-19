import { describe, expect, test } from "bun:test";
import { isRequestPayloadTooLarge } from "./request-guards";

describe("isRequestPayloadTooLarge", () => {
	test("returns false when content-length header is missing", () => {
		const request = new Request("http://localhost:3000/mcp", {
			method: "POST",
		});

		expect(isRequestPayloadTooLarge(request, 100)).toBe(false);
	});

	test("returns true when content-length exceeds max bytes", () => {
		const request = new Request("http://localhost:3000/mcp", {
			method: "POST",
			headers: { "content-length": "101" },
		});

		expect(isRequestPayloadTooLarge(request, 100)).toBe(true);
	});

	test("returns false when content-length is invalid", () => {
		const request = new Request("http://localhost:3000/mcp", {
			method: "POST",
			headers: { "content-length": "not-a-number" },
		});

		expect(isRequestPayloadTooLarge(request, 100)).toBe(false);
	});
});
