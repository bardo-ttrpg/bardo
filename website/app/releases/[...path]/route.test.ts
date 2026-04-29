import { describe, expect, test } from "bun:test";
import { GET } from "./route";

describe("legacy release route", () => {
	test("redirects legacy bardo.gg release asset URLs to the public GitHub release", async () => {
		const response = await GET(new Request("https://www.bardo.gg/releases/v0.1.1/SHA256SUMS.txt"), {
			params: Promise.resolve({ path: ["v0.1.1", "SHA256SUMS.txt"] }),
		});

		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(
			"https://github.com/armando-andre/bardo-mcp/releases/download/v0.1.1/SHA256SUMS.txt",
		);
	});
});
