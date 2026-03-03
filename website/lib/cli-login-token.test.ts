import { describe, expect, test } from "bun:test";
import {
	type CliLoginExchangePayload,
	createCliLoginTokenCodec,
} from "./cli-login-token";

function payload(overrides: Partial<CliLoginExchangePayload> = {}) {
	return {
		apiKey: "bardo_live_test",
		mcpUrl: "https://mcp.bardo.ai/mcp",
		serverName: "bardo",
		issuedAtISO: "2026-03-03T00:00:00.000Z",
		expiresAtISO: "2026-03-03T00:10:00.000Z",
		...overrides,
	};
}

describe("cli login token codec", () => {
	test("round-trips an encrypted login payload", async () => {
		const codec = createCliLoginTokenCodec("test-secret-123456");
		const token = await codec.encrypt(payload());

		const decoded = await codec.decrypt(token, {
			now: new Date("2026-03-03T00:05:00.000Z"),
		});

		expect(decoded.apiKey).toBe("bardo_live_test");
		expect(decoded.mcpUrl).toBe("https://mcp.bardo.ai/mcp");
		expect(decoded.serverName).toBe("bardo");
	});

	test("rejects expired tokens", async () => {
		const codec = createCliLoginTokenCodec("test-secret-123456");
		const token = await codec.encrypt(
			payload({ expiresAtISO: "2026-03-03T00:00:01.000Z" }),
		);

		await expect(
			codec.decrypt(token, { now: new Date("2026-03-03T00:05:00.000Z") }),
		).rejects.toThrow("expired");
	});
});
