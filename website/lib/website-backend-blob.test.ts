import { describe, expect, mock, test } from "bun:test";

const blobs = new Map<string, string>();

mock.module("@vercel/blob", () => ({
	get: async (pathname: string) => {
		const body = blobs.get(pathname);
		if (body === undefined) return null;
		return {
			text: async () => body,
		};
	},
	put: async (pathname: string, body: string) => {
		blobs.set(pathname, body);
		return {
			pathname,
			url: `https://blob.example/${pathname}`,
		};
	},
}));

describe("createWebsiteBackendClient blob driver", () => {
	test("persists bridge approval across separate Vercel backend clients", async () => {
		blobs.clear();
		const { createWebsiteBackendClient } = await import("./website-backend");
		const env = {
			BARDO_WEBSITE_BACKEND_DRIVER: "blob",
			BARDO_WEBSITE_BACKEND_PREFIX: "test-prod",
			BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_token",
			VERCEL_ENV: "production",
		};
		const starter = createWebsiteBackendClient(env);
		const approver = createWebsiteBackendClient(env);
		const poller = createWebsiteBackendClient(env);

		if (!starter || !approver || !poller) {
			throw new Error("Expected blob-backed website clients.");
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
		expect([...blobs.keys()]).toContain(
			`test-prod/cli-device-sessions/${started.sessionId}.json`,
		);
	});

	test("persists bridge denial and refresh rotation across separate clients", async () => {
		blobs.clear();
		const { createWebsiteBackendClient } = await import("./website-backend");
		const env = {
			BARDO_WEBSITE_BACKEND_DRIVER: "blob",
			BARDO_WEBSITE_BACKEND_PREFIX: "test-prod",
			BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_token",
			VERCEL_ENV: "production",
		};
		const starter = createWebsiteBackendClient(env);
		const approver = createWebsiteBackendClient(env);
		const poller = createWebsiteBackendClient(env);
		const rotator = createWebsiteBackendClient(env);

		if (!starter || !approver || !poller || !rotator) {
			throw new Error("Expected blob-backed website clients.");
		}

		const deniedSession = await starter.startCliDeviceSession({
			now: new Date("2036-03-25T00:00:00.000Z"),
			ttlMs: 60_000,
			intervalMs: 3000,
		});
		await approver.denyCliDeviceSession({
			sessionId: deniedSession.sessionId,
			deniedAtISO: "2036-03-25T00:00:10.000Z",
			error:
				"An active Pro subscription is required before a bridge can connect to Bardo.",
		});

		expect(
			await poller.pollCliDeviceSession({
				sessionId: deniedSession.sessionId,
				pollSecret: deniedSession.pollSecret,
			}),
		).toEqual({
			status: "denied",
			error:
				"An active Pro subscription is required before a bridge can connect to Bardo.",
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
