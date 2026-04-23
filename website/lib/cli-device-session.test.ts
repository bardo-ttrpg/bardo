import { describe, expect, mock, test } from "bun:test";
import type { BridgeSessionCredentialBundle } from "./bridge-session-auth";
import { createCliDeviceSessionService } from "./cli-device-session";

describe("cli device session service", () => {
	test("persists pending, approval, and one-time consumption through the website session ledger", async () => {
		const session = {
			sessionId: "session_123",
			pollSecret: "poll_secret_123",
			userCode: "ABCD-1234",
			expiresAtISO: "2026-03-03T00:10:00.000Z",
			intervalMs: 3000,
		};
		const approvedPayload: BridgeSessionCredentialBundle = {
			accessToken: "access-token",
			refreshToken: "refresh-token",
			expiresAt: "2026-03-03T00:10:00.000Z",
			statusUrl: "https://app.bardo.ai/api/connect/runtime-status",
			refreshUrl: "https://app.bardo.ai/api/connect/bridge-session/refresh",
			plan: "pro",
			accountLabel: "Armando",
			serverName: "bardo",
			issuedAtISO: "2026-03-03T00:00:00.000Z",
		};
		const store = {
			startSession: mock(async () => session),
			pollSession: mock(async ({ attempt }: { attempt: number }) =>
				attempt === 1
					? { status: "pending" as const, intervalMs: session.intervalMs }
					: attempt === 2
						? { status: "approved" as const, payload: approvedPayload }
						: { status: "consumed" as const },
			),
			approveSession: mock(async () => ({ ok: true as const })),
		};

		const service = createCliDeviceSessionService({
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			store,
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
			payload: approvedPayload,
		});
		expect(approved).toEqual({ ok: true });

		const firstPoll = await service.poll({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});
		expect(firstPoll).toMatchObject({
			status: "approved",
			payload: {
				accessToken: "access-token",
				plan: "pro",
			},
		});

		const replayPoll = await service.poll({
			sessionId: started.sessionId,
			pollSecret: started.pollSecret,
		});
		expect(replayPoll).toEqual({ status: "consumed" });
		expect(store.startSession).toHaveBeenCalledTimes(1);
		expect(store.approveSession).toHaveBeenCalledTimes(1);
	});

	test("surfaces durable-store availability failures when no backing store is configured", async () => {
		const service = createCliDeviceSessionService({
			now: () => new Date("2026-03-03T00:00:00.000Z"),
			env: {
				NODE_ENV: "production",
			},
			store: null,
		});

		await expect(service.start()).rejects.toThrow(
			"website device session store",
		);
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
