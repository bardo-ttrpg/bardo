import { describe, expect, mock, test } from "bun:test";
import { createCliDeviceSessionService } from "./cli-device-session";

describe("cli device session service", () => {
	test("persists pending, approval, and one-time consumption through Upstash semantics", async () => {
		const redis = new Map<string, string>();
		const fetchImpl = mock(async (input: RequestInfo | URL) => {
			const url = new URL(String(input));
			const segments = url.pathname.split("/").filter(Boolean);
			const [command, ...parts] = segments;

			if (command === "set") {
				const key = decodeURIComponent(parts[0] ?? "");
				const value = decodeURIComponent(parts[1] ?? "");
				const mode = parts[2];
				const ttlMode = parts[3];
				const ttlValue = Number(parts[4]);
				expect(ttlMode).toBe("EX");
				expect(ttlValue).toBeGreaterThan(0);
				if (mode === "NX" && redis.has(key)) {
					return Response.json({ result: null });
				}
				if (mode === "XX" && !redis.has(key)) {
					return Response.json({ result: null });
				}
				redis.set(key, value);
				return Response.json({ result: "OK" });
			}

			if (command === "get") {
				const key = decodeURIComponent(parts[0] ?? "");
				return Response.json({ result: redis.get(key) ?? null });
			}

			if (command === "del") {
				const key = decodeURIComponent(parts[0] ?? "");
				redis.delete(key);
				return Response.json({ result: 1 });
			}

			throw new Error(`Unexpected Upstash command: ${url.pathname}`);
		});

		const service = createCliDeviceSessionService({
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
				UPSTASH_REDIS_REST_URL: "https://staging.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-staging",
			},
			fetchImpl,
		});

		const started = await service.start();
		const pending = await service.poll({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});
		expect(pending).toEqual({
			status: "pending",
			intervalMs: started.intervalMs,
		});

		const approved = await service.approve({
			sessionId: started.sessionId,
			payload: {
				apiKey: "bardo_live_test",
				mcpUrl: "https://mcp.bardo.ai/mcp",
				statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
				serverName: "bardo",
				issuedAtISO: "2026-03-03T00:00:00.000Z",
				expiresAtISO: "2026-03-03T00:10:00.000Z",
			},
		});
		expect(approved).toEqual({ ok: true });

		const firstPoll = await service.poll({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});
		expect(firstPoll).toMatchObject({
			status: "approved",
			payload: {
				apiKey: "bardo_live_test",
			},
		});

		const replayPoll = await service.poll({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});
		expect(replayPoll).toEqual({ status: "consumed" });
		expect(fetchImpl).toHaveBeenCalled();
	});

	test("rejects non-production Upstash configs that do not target bardo-staging", async () => {
		const service = createCliDeviceSessionService({
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "development",
				BARDO_CLI_DEVICE_SESSION_ALLOW_MEMORY_FALLBACK: "false",
				UPSTASH_REDIS_REST_URL: "https://production.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "upstash-token",
				UPSTASH_REDIS_DATABASE_NAME: "bardo-production",
			},
			fetchImpl: mock(async () => {
				throw new Error("fetch should not run");
			}),
		});

		await expect(service.start()).rejects.toThrow("bardo-staging");
	});

	test("does not rely on Math.random when generating the user approval code", async () => {
		const originalRandom = Math.random;
		Math.random = () => {
			throw new Error("Math.random should not be used for device codes");
		};

		try {
			const service = createCliDeviceSessionService({
				now: () => new Date("2026-03-03T00:00:00.000Z"),
				env: {
					NODE_ENV: "development",
				},
			});

			const started = await service.start();
			expect(started.userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
		} finally {
			Math.random = originalRandom;
		}
	});
});
