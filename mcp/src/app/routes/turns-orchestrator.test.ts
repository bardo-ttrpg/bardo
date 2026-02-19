import { describe, expect, test } from "bun:test";
import {
	parseResolveTurnPayload,
	parseSseJsonEvents,
} from "./turns-orchestrator";

describe("parseResolveTurnPayload", () => {
	test("normalizes defaults for minimal payload", () => {
		const parsed = parseResolveTurnPayload({
			action: "I travel to the old mine.",
		});

		expect(parsed).toEqual({
			action: "I travel to the old mine.",
			transcript: null,
			syncWorld: false,
			includeState: true,
		});
	});

	test("enables world sync only when transcript exists", () => {
		const parsed = parseResolveTurnPayload({
			action: "I ask the guard for directions.",
			transcript:
				'The guard says: "I am Captain Halvar. Welcome to Ironhaven."',
		});

		expect(parsed.syncWorld).toBe(true);
		expect(parsed.transcript).toContain("Captain Halvar");
	});

	test("throws on invalid payloads", () => {
		expect(() => parseResolveTurnPayload({ action: "" })).toThrow(
			"Invalid turn payload",
		);
	});
});

describe("parseSseJsonEvents", () => {
	test("returns parsed events from SSE lines", () => {
		const body = [
			"event: message",
			'data: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}',
			"",
			"event: message",
			'data: {"jsonrpc":"2.0","id":2,"result":{"ok":false}}',
			"",
		].join("\n");

		const events = parseSseJsonEvents(body);
		expect(events).toHaveLength(2);
		expect(events[1]).toEqual({
			jsonrpc: "2.0",
			id: 2,
			result: { ok: false },
		});
	});

	test("supports direct JSON response bodies", () => {
		const events = parseSseJsonEvents('{"jsonrpc":"2.0","result":{"ok":true}}');
		expect(events).toEqual([{ jsonrpc: "2.0", result: { ok: true } }]);
	});
});
