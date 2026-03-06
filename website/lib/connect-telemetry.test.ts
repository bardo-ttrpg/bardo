import { describe, expect, mock, test } from "bun:test";
import { createConnectTelemetry } from "./connect-telemetry";

describe("connect telemetry", () => {
	test("tracks route outcome counters", () => {
		const telemetry = createConnectTelemetry();
		telemetry.increment("cli_session_started");
		telemetry.increment("cli_session_started");
		telemetry.increment("runtime_status_success");

		expect(telemetry.snapshot()).toEqual({
			cli_token_issued: 0,
			cli_token_failed: 0,
			cli_exchange_success: 0,
			cli_exchange_rejected: 0,
			cli_exchange_failed: 0,
			cli_session_started: 2,
			cli_session_start_failed: 0,
			cli_session_poll_pending: 0,
			cli_session_poll_approved: 0,
			cli_session_poll_rejected: 0,
			cli_session_poll_failed: 0,
			cli_session_approved: 0,
			cli_session_approve_rejected: 0,
			cli_session_approve_failed: 0,
			runtime_status_success: 1,
			runtime_status_invalid: 0,
			runtime_status_failed: 0,
			connect_snippets_success: 0,
			connect_snippets_rejected: 0,
			connect_snippets_failed: 0,
		});
	});

	test("can emit periodic telemetry snapshots through the provided logger", () => {
		const info = mock(() => undefined);
		const telemetry = createConnectTelemetry({
			logEnabled: true,
			logEvery: 2,
			logger: { info },
		});

		telemetry.increment("cli_token_issued");
		telemetry.increment("cli_exchange_success");

		expect(info).toHaveBeenCalledTimes(1);
		expect(info).toHaveBeenCalledWith(
			"bardo.connect.telemetry_snapshot",
			expect.objectContaining({
				"bardo.service": "website",
				"bardo.flow": "connect",
				"bardo.connect.cli_token_issued": 1,
				"bardo.connect.cli_exchange_success": 1,
			}),
		);
	});
});
