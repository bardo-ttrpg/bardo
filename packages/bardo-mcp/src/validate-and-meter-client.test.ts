import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createValidateAndMeterClient } from "./validate-and-meter-client";

describe("validate-and-meter client", () => {
	test("uses the live website response and updates local cache", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");

		try {
			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							valid: true,
							remaining_quota: 42,
							plan: "free",
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					),
			});

			const result = await client.validateAndMeter({
				tool: "bardo_workspace_status",
				action: "invoke",
			});

			expect(result.remainingQuota).toBe(42);
			expect(result.usedCachedGrace).toBe(false);
			await expect(readFile(cachePath, "utf8")).resolves.toContain(
				'"quota_remaining": 42',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("falls back to fresh cache on network errors and appends NDJSON pending entry", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const now = Date.now();
		try {
			await writeFile(
				cachePath,
				JSON.stringify(
					{
						key_hash: createHash("sha256")
							.update("bardo_sk_test", "utf8")
							.digest("hex"),
						validated_at: now,
						ttl_ms: 3_600_000,
						plan: "free",
						quota_remaining: 2,
					},
					null,
					2,
				),
				"utf8",
			);

			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				nowMs: () => now + 1_000,
				fetchImpl: async () => {
					throw new Error("network down");
				},
			});

			const result = await client.validateAndMeter({
				tool: "bardo_workspace_status",
				action: "invoke",
			});

			expect(result.usedCachedGrace).toBe(true);
			expect(result.remainingQuota).toBe(1);
			await expect(readFile(pendingPath, "utf8")).resolves.toContain(
				'"tool":"bardo_workspace_status"',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("fails closed on network errors in production even when a fresh cache exists", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const now = Date.now();
		try {
			await writeFile(
				cachePath,
				JSON.stringify(
					{
						key_hash: createHash("sha256")
							.update("bardo_sk_test", "utf8")
							.digest("hex"),
						validated_at: now,
						ttl_ms: 3_600_000,
						plan: "pro",
						quota_remaining: 9,
					},
					null,
					2,
				),
				"utf8",
			);

			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				nowMs: () => now + 1_000,
				env: {
					NODE_ENV: "production",
				},
				fetchImpl: async () => {
					throw new Error("network down");
				},
			});

			await expect(
				client.validateAndMeter({
					tool: "bardo_workspace_status",
					action: "invoke",
				}),
			).rejects.toThrow("validate_and_meter_unavailable");
			await expect(readFile(pendingPath, "utf8")).rejects.toThrow();
			const cache = await readFile(cachePath, "utf8");
			expect(cache).toContain('"quota_remaining": 9');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("does not grant cached grace for explicit deny responses from the website", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const now = Date.now();

		try {
			await writeFile(
				cachePath,
				JSON.stringify(
					{
						key_hash: createHash("sha256")
							.update("bardo_sk_test", "utf8")
							.digest("hex"),
						validated_at: now,
						ttl_ms: 3_600_000,
						plan: "free",
						quota_remaining: 2,
					},
					null,
					2,
				),
				"utf8",
			);

			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				nowMs: () => now + 1_000,
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							valid: false,
							reason: "invalid_key",
						}),
						{
							status: 401,
							headers: { "content-type": "application/json" },
						},
					),
			});

			await expect(
				client.validateAndMeter({
					tool: "bardo_workspace_status",
					action: "invoke",
				}),
			).rejects.toThrow("invalid_key");
			await expect(readFile(cachePath, "utf8")).rejects.toThrow();
			await expect(readFile(pendingPath, "utf8")).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("submits pending entries before validating current call and clears pending on commit", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");
		const calls: string[] = [];

		try {
			await writeFile(
				pendingPath,
				`${JSON.stringify({
					id: "entry-1",
					ts: Date.now() - 5_000,
					tool: "tool_a",
					action: "invoke",
					units: 1,
					workspace_id: "/tmp/workspace",
				})}\n`,
				"utf8",
			);
			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				fetchImpl: async (_input, init) => {
					const body = init?.body ? JSON.parse(String(init.body)) : {};
					if (body.reconciliation) {
						calls.push("reconcile");
						return new Response(
							JSON.stringify({
								valid: true,
								remaining_quota: 30,
								plan: "free",
							}),
							{ status: 200, headers: { "content-type": "application/json" } },
						);
					}
					calls.push("live");
					return new Response(
						JSON.stringify({
							valid: true,
							remaining_quota: 29,
							plan: "free",
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
				},
			});

			await client.validateAndMeter({
				tool: "bardo_workspace_status",
				action: "invoke",
			});

			expect(calls).toEqual(["reconcile", "live"]);
			await expect(readFile(pendingPath, "utf8")).rejects.toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("surfaces quota_exceeded when reconciliation fails retroactively", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-meter-client-"));
		const cachePath = path.join(root, "auth-cache.json");
		const pendingPath = path.join(root, "auth-cache-pending.ndjson");

		try {
			await writeFile(
				pendingPath,
				`${JSON.stringify({
					id: "entry-1",
					ts: Date.now() - 5_000,
					tool: "tool_a",
					action: "invoke",
					units: 1,
					workspace_id: "/tmp/workspace",
				})}\n`,
				"utf8",
			);
			const client = createValidateAndMeterClient({
				apiKey: "bardo_sk_test",
				workspaceId: "/tmp/workspace",
				websiteMeteringUrl: "https://example.com/api/v1/validate-and-meter",
				cachePath,
				pendingPath,
				fetchImpl: async (_input, init) => {
					const body = init?.body ? JSON.parse(String(init.body)) : {};
					if (body.reconciliation) {
						return new Response(
							JSON.stringify({
								valid: false,
								reason: "quota_exceeded",
							}),
							{ status: 429, headers: { "content-type": "application/json" } },
						);
					}
					throw new Error("unexpected live call");
				},
			});

			await expect(
				client.validateAndMeter({
					tool: "bardo_workspace_status",
					action: "invoke",
				}),
			).rejects.toThrow("quota_exceeded");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
