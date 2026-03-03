import { describe, expect, test } from "bun:test";
import { createCliLoginTokenStore } from "./cli-login-store";

describe("cli login token store", () => {
	test("accepts the first token use and rejects a replay", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
		});

		const first = await store.consume({
			token: "cli_token_a",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});
		const second = await store.consume({
			token: "cli_token_a",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(false);
		expect(second.reason).toBe("already_used");
	});

	test("rejects expired tokens before storing them", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:05:00.000Z"),
		});

		const result = await store.consume({
			token: "cli_token_expired",
			expiresAtISO: "2026-03-03T00:04:59.000Z",
		});

		expect(result.ok).toBe(false);
		expect(result.reason).toBe("expired");
	});
});
