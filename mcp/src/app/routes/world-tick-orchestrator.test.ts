import { describe, expect, test } from "bun:test";
import { parseWorldTickPayload } from "./world-tick-orchestrator";

describe("parseWorldTickPayload", () => {
	test("normalizes default mode", () => {
		const parsed = parseWorldTickPayload({
			idempotencyKey: "tick_12345678",
		});

		expect(parsed.mode).toBe("turn");
		expect(parsed.idempotencyKey).toBe("tick_12345678");
	});

	test("accepts scheduled mode with bounded tick count", () => {
		const parsed = parseWorldTickPayload({
			mode: "scheduled",
			tickCount: 3,
			idempotencyKey: "scheduled_12345678",
			dryRun: true,
		});

		expect(parsed.mode).toBe("scheduled");
		expect(parsed.tickCount).toBe(3);
		expect(parsed.dryRun).toBe(true);
	});

	test("rejects missing idempotency key", () => {
		expect(() =>
			parseWorldTickPayload({
				mode: "turn",
			}),
		).toThrow("Invalid world tick payload");
	});
});
