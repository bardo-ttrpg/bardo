import { describe, expect, mock, test } from "bun:test";
import {
	initSentry,
	logSentryMessage,
	maybeWrapMcpServerWithSentry,
	resolveSentryRelease,
	shouldIgnoreSentryErrorEvent,
} from "./sentry";

describe("maybeWrapMcpServerWithSentry", () => {
	test("returns the original server when sentry is disabled", () => {
		const server = { name: "original" };
		let wrapped = false;

		const result = maybeWrapMcpServerWithSentry(server, {
			enabled: false,
			dsn: "https://example.ingest.sentry.io/1",
			wrapServer: () => {
				wrapped = true;
				return { name: "wrapped" };
			},
		});

		expect(result).toBe(server);
		expect(wrapped).toBe(false);
	});

	test("wraps the server when sentry is enabled and a dsn exists", () => {
		const server = { name: "original" };

		const result = maybeWrapMcpServerWithSentry(server, {
			enabled: true,
			dsn: "https://example.ingest.sentry.io/1",
			wrapServer: (candidate) => ({ ...candidate, name: "wrapped" }),
		});

		expect(result).toEqual({ name: "wrapped" });
	});
});

describe("initSentry", () => {
	test("enables logs and resolves release from platform metadata", () => {
		const init = mock(() => {});

		initSentry({
			env: {
				BARDO_SENTRY_ENABLED: "true",
				SENTRY_DSN: "https://example.ingest.sentry.io/1",
				SENTRY_ENVIRONMENT: "production",
				RAILWAY_GIT_COMMIT_SHA: "railway-sha",
				BARDO_SENTRY_TRACES_SAMPLE_RATE: "0.1",
			},
			sdk: { init } as never,
		});

		expect(init).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledWith({
			dsn: "https://example.ingest.sentry.io/1",
			environment: "production",
			release: "railway-sha",
			tracesSampleRate: 0.1,
			enableLogs: true,
			sendDefaultPii: false,
			beforeSend: expect.any(Function),
		});

		const calls = init.mock.calls as unknown as Array<
			[Record<string, unknown>]
		>;
		const firstCall = calls[0];
		if (!firstCall) {
			throw new Error("expected Sentry.init to be called");
		}
		const [options] = firstCall;
		const beforeSend = options.beforeSend as (event: unknown) => unknown;
		expect(
			beforeSend({
				exception: {
					values: [
						{
							value:
								"JsonRpcError_-32603: STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED: projections/current-state.md is required in strict canonical mode.",
						},
					],
				},
			}),
		).toBeNull();
	});
});

describe("logSentryMessage", () => {
	test("sends structured logs when sentry logging is enabled", () => {
		const info = mock(() => {});

		logSentryMessage(
			"info",
			"mcp.startup.config",
			{
				"bardo.service": "mcp",
				"bardo.transport_mode": "stateful",
			},
			{
				env: {
					BARDO_SENTRY_ENABLED: "true",
					SENTRY_DSN: "https://example.ingest.sentry.io/1",
				},
				sdk: {
					logger: { info },
				} as never,
			},
		);

		expect(info).toHaveBeenCalledWith("mcp.startup.config", {
			"bardo.service": "mcp",
			"bardo.transport_mode": "stateful",
		});
	});
});

describe("resolveSentryRelease", () => {
	test("prefers an explicit release over platform metadata", () => {
		expect(
			resolveSentryRelease({
				SENTRY_RELEASE: "mcp@explicit",
				RAILWAY_GIT_COMMIT_SHA: "ignored",
			}),
		).toBe("mcp@explicit");
	});
});

describe("shouldIgnoreSentryErrorEvent", () => {
	test("ignores expected strict canonical MCP tool errors", () => {
		expect(
			shouldIgnoreSentryErrorEvent({
				exception: {
					values: [
						{
							value:
								"JsonRpcError_-32603: STRICT_CANONICAL_STALE_PROJECTION: projection metadata is stale.",
						},
					],
				},
			}),
		).toBe(true);
	});

	test("keeps unrelated errors", () => {
		expect(
			shouldIgnoreSentryErrorEvent({
				exception: {
					values: [{ value: "TypeError: boom" }],
				},
			}),
		).toBe(false);
	});
});
