import { describe, expect, mock, test } from "bun:test";
import { createCliLoginTokenStore } from "./cli-login-store";

describe("cli login token store", () => {
	test("accepts the first token use and rejects a replay", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "true",
			},
			store: null,
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
		expect(second).toEqual({ ok: false, reason: "already_used" });
	});

	test("rejects expired tokens before storing them", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:05:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "true",
			},
			store: null,
		});

		const result = await store.consume({
			token: "cli_token_expired",
			expiresAtISO: "2026-03-03T00:04:59.000Z",
		});

		expect(result).toEqual({ ok: false, reason: "expired" });
	});

	test("persists one-time token claims through the website session store", async () => {
		const controlPlane = {
			consumeCliLoginToken: mock(async () => ({ ok: true as const })),
		};
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			store: controlPlane,
		});

		const result = await store.consume({
			token: "cli_token_control_plane",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(result.ok).toBe(true);
		expect(controlPlane.consumeCliLoginToken).toHaveBeenCalledTimes(1);
	});

	test("rejects replays when the website session store marks a token as already used", async () => {
		const controlPlane = {
			consumeCliLoginToken: mock(async () => ({
				ok: false as const,
				reason: "already_used" as const,
			})),
		};
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			store: controlPlane,
		});

		const result = await store.consume({
			token: "cli_token_control_plane_replay",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(result).toEqual({ ok: false, reason: "already_used" });
	});

	test("surfaces an availability error when the website session store is required but missing", async () => {
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "production",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "false",
			},
			store: null,
		});

		await expect(
			store.consume({
				token: "cli_token_wrong_db",
				expiresAtISO: "2026-03-03T00:05:00.000Z",
			}),
		).rejects.toThrow("website login replay store");
	});

	test("falls back to memory replay protection when the website session store is unreachable in development", async () => {
		const controlPlane = {
			consumeCliLoginToken: mock(async () => {
				throw new Error("fetch failed");
			}),
		};
		const store = createCliLoginTokenStore({
			nowMs: () => Date.parse("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_LOGIN_REPLAY_ALLOW_MEMORY_FALLBACK: "true",
			},
			store: controlPlane,
		});

		const first = await store.consume({
			token: "cli_token_fallback",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});
		const second = await store.consume({
			token: "cli_token_fallback",
			expiresAtISO: "2026-03-03T00:05:00.000Z",
		});

		expect(first).toEqual({ ok: true });
		expect(second).toEqual({ ok: false, reason: "already_used" });
		expect(controlPlane.consumeCliLoginToken).toHaveBeenCalledTimes(2);
	});
});
