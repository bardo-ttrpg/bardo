import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWebsiteBackendClient } from "./website-backend";

function createRequiredWebsiteBackendClient(sqlitePath: string) {
	const client = createWebsiteBackendClient({
		BARDO_WEBSITE_BACKEND_SQLITE_PATH: sqlitePath,
	});
	if (!client) {
		throw new Error("Expected a website backend client for the test.");
	}
	return client;
}

describe("createWebsiteBackendClient", () => {
	test("persists rate-limit windows across client instances", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-website-backend-"),
		);
		const sqlitePath = path.join(root, "backend.sqlite");

		try {
			const first = createRequiredWebsiteBackendClient(sqlitePath);
			const one = await first.consumeRateLimitWindow({
				scope: "verify:user",
				counterKey: "user_1",
				limit: 2,
				windowMs: 60_000,
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 0),
			});
			const second = createRequiredWebsiteBackendClient(sqlitePath);
			const two = await second.consumeRateLimitWindow({
				scope: "verify:user",
				counterKey: "user_1",
				limit: 2,
				windowMs: 60_000,
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 1),
			});
			const blocked = await second.consumeRateLimitWindow({
				scope: "verify:user",
				counterKey: "user_1",
				limit: 2,
				windowMs: 60_000,
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 2),
			});

			expect(one.allowed).toBe(true);
			expect(one.backend).toBe("website");
			expect(two.allowed).toBe(true);
			expect(two.remaining).toBe(0);
			expect(blocked.allowed).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("persists CLI login replay protection across client instances", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-website-backend-"),
		);
		const sqlitePath = path.join(root, "backend.sqlite");

		try {
			const first = createRequiredWebsiteBackendClient(sqlitePath);
			const second = createRequiredWebsiteBackendClient(sqlitePath);

			const accepted = await first.consumeCliLoginToken({
				token: "cli_token_1",
				expiresAtISO: "2026-03-25T00:05:00.000Z",
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 0),
			});
			const replay = await second.consumeCliLoginToken({
				token: "cli_token_1",
				expiresAtISO: "2026-03-25T00:05:00.000Z",
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 1),
			});

			expect(accepted).toEqual({ ok: true });
			expect(replay).toEqual({ ok: false, reason: "already_used" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("prunes expired rate-limit windows before persisting new ones", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-website-backend-"),
		);
		const sqlitePath = path.join(root, "backend.sqlite");

		try {
			const client = createRequiredWebsiteBackendClient(sqlitePath);
			await client.consumeRateLimitWindow({
				scope: "verify:user",
				counterKey: "user_1",
				limit: 2,
				windowMs: 60_000,
				nowMs: Date.UTC(2026, 2, 25, 0, 0, 0),
			});
			await client.consumeRateLimitWindow({
				scope: "verify:user",
				counterKey: "user_1",
				limit: 2,
				windowMs: 60_000,
				nowMs: Date.UTC(2026, 2, 25, 0, 5, 0),
			});

			const raw = await readFile(sqlitePath, "utf8");
			const parsed = JSON.parse(raw) as {
				rateLimitWindows?: Record<string, unknown>;
			};
			const keys = Object.keys(parsed.rateLimitWindows ?? {});

			expect(keys).toHaveLength(1);
			expect(keys[0]).toContain(String(Date.UTC(2026, 2, 25, 0, 5, 0)));
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("persists device session approval and one-time consumption across client instances", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-website-backend-"),
		);
		const sqlitePath = path.join(root, "backend.sqlite");

		try {
			const starter = createRequiredWebsiteBackendClient(sqlitePath);
			const approver = createRequiredWebsiteBackendClient(sqlitePath);
			const poller = createRequiredWebsiteBackendClient(sqlitePath);

			const started = await starter.startCliDeviceSession({
				now: new Date("2036-03-25T00:00:00.000Z"),
				ttlMs: 60_000,
				intervalMs: 3000,
			});
			const approved = await approver.approveCliDeviceSession({
				sessionId: started.sessionId,
				approvedAtISO: "2036-03-25T00:00:10.000Z",
				payload: {
					accessToken: "access-token",
					refreshToken: "refresh-token",
					expiresAt: "2036-03-25T00:10:00.000Z",
					mcpBaseUrl: "https://mcp.example.com",
					statusUrl: "https://app.example.com/api/connect/runtime-status",
					refreshUrl:
						"https://app.example.com/api/connect/bridge-session/refresh",
					plan: "solo",
					accountLabel: "Armando",
					serverName: "bardo",
					issuedAtISO: "2036-03-25T00:00:10.000Z",
				},
			});
			const firstPoll = await poller.pollCliDeviceSession({
				sessionId: started.sessionId,
				pollSecret: started.pollSecret,
			});
			const secondPoll = await poller.pollCliDeviceSession({
				sessionId: started.sessionId,
				pollSecret: started.pollSecret,
			});

			expect(approved).toEqual({ ok: true });
			expect(firstPoll).toMatchObject({
				status: "approved",
				payload: {
					accessToken: "access-token",
				},
			});
			expect(secondPoll).toEqual({ status: "consumed" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
