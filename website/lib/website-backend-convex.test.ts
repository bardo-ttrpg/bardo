import { describe, expect, mock, test } from "bun:test";

const records = new Map<string, unknown>();

mock.module("convex/browser", () => ({
	ConvexHttpClient: class {
		query(_: unknown, args: { key: string; token: string }) {
			if (args.token !== "test-convex-secret") {
				throw new Error("Invalid Convex backend secret.");
			}
			return Promise.resolve(records.get(args.key) ?? null);
		}

		mutation(
			_: unknown,
			args: { key: string; value?: unknown; token: string },
		) {
			if (args.token !== "test-convex-secret") {
				throw new Error("Invalid Convex backend secret.");
			}
			if ("value" in args) {
				records.set(args.key, args.value);
			}
			return Promise.resolve(null);
		}
	},
}));

describe("createWebsiteBackendClient convex driver", () => {
	test("persists bridge approval across separate Vercel backend clients", async () => {
		records.clear();
		const { createWebsiteBackendClient } = await import("./website-backend");
		const env = {
			BARDO_WEBSITE_BACKEND_DRIVER: "convex",
			BARDO_CONVEX_BACKEND_SECRET: "test-convex-secret",
			NEXT_PUBLIC_CONVEX_URL: "https://steady-bardo.convex.cloud",
			VERCEL_ENV: "production",
		};
		const starter = createWebsiteBackendClient(env);
		const approver = createWebsiteBackendClient(env);
		const poller = createWebsiteBackendClient(env);

		if (!starter || !approver || !poller) {
			throw new Error("Expected convex-backed website clients.");
		}

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
				statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
				refreshUrl: "https://www.bardo.gg/api/connect/bridge-session/refresh",
				plan: "pro",
				accountLabel: "Armando",
				serverName: "bardo",
				issuedAtISO: "2036-03-25T00:00:10.000Z",
			},
		});
		const polled = await poller.pollCliDeviceSession({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});

		expect(approved).toEqual({ ok: true });
		expect(polled).toMatchObject({
			status: "approved",
			payload: {
				accessToken: "access-token",
			},
		});
		expect(records.has(`cli-device-sessions/${started.sessionId}`)).toBe(true);
	});

	test("persists bridge denial and refresh rotation across separate clients", async () => {
		records.clear();
		const { createWebsiteBackendClient } = await import("./website-backend");
		const env = {
			BARDO_WEBSITE_BACKEND_DRIVER: "convex",
			BARDO_CONVEX_BACKEND_SECRET: "test-convex-secret",
			CONVEX_URL: "https://steady-bardo.convex.cloud",
			VERCEL_ENV: "production",
		};
		const starter = createWebsiteBackendClient(env);
		const approver = createWebsiteBackendClient(env);
		const poller = createWebsiteBackendClient(env);
		const rotator = createWebsiteBackendClient(env);

		if (!starter || !approver || !poller || !rotator) {
			throw new Error("Expected convex-backed website clients.");
		}

		const deniedSession = await starter.startCliDeviceSession({
			now: new Date("2036-03-25T00:00:00.000Z"),
			ttlMs: 60_000,
			intervalMs: 3000,
		});
		await approver.denyCliDeviceSession({
			sessionId: deniedSession.sessionId,
			deniedAtISO: "2036-03-25T00:00:10.000Z",
			error: "Bridge approval was denied.",
		});

		expect(
			await poller.pollCliDeviceSession({
				sessionId: deniedSession.sessionId,
				pollSecret: deniedSession.pollSecret,
			}),
		).toEqual({
			status: "denied",
			error: "Bridge approval was denied.",
		});

		const refreshSession = await starter.startCliDeviceSession({
			now: new Date("2036-03-25T00:00:00.000Z"),
			ttlMs: 60_000,
			intervalMs: 3000,
		});
		await approver.approveCliDeviceSession({
			sessionId: refreshSession.sessionId,
			approvedAtISO: "2036-03-25T00:00:10.000Z",
			payload: {
				accessToken: "access-token",
				refreshToken: "refresh-token-1",
				expiresAt: "2036-03-25T00:10:00.000Z",
				statusUrl: "https://www.bardo.gg/api/connect/runtime-status",
				refreshUrl: "https://www.bardo.gg/api/connect/bridge-session/refresh",
				plan: "pro",
				accountLabel: "Armando",
				serverName: "bardo",
				issuedAtISO: "2036-03-25T00:00:10.000Z",
			},
		});

		expect(
			await rotator.rotateBridgeRefreshSession({
				sessionId: refreshSession.sessionId,
				refreshToken: "refresh-token-1",
				nextRefreshToken: "refresh-token-2",
			}),
		).toEqual({ ok: true });
		expect(
			await rotator.rotateBridgeRefreshSession({
				sessionId: refreshSession.sessionId,
				refreshToken: "refresh-token-1",
				nextRefreshToken: "refresh-token-3",
			}),
		).toEqual({ ok: false, reason: "invalid" });
	});
});
