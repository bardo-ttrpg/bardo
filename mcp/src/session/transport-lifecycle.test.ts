import { describe, expect, test } from "bun:test";
import { createSessionFinalizer } from "./transport-lifecycle";

describe("createSessionFinalizer", () => {
	test("deletes the same session only once when both close paths fire", () => {
		const deleted: string[] = [];
		let closedCount = 0;
		const finalize = createSessionFinalizer(
			{
				delete: (sessionId: string) => {
					deleted.push(sessionId);
					return true;
				},
			},
			() => {
				closedCount += 1;
			},
		);

		finalize("session-1");
		finalize("session-1");

		expect(deleted).toEqual(["session-1"]);
		expect(closedCount).toBe(1);
	});

	test("still deletes once when transport close happens before session id is known", () => {
		const deleted: string[] = [];
		let closedCount = 0;
		const finalize = createSessionFinalizer(
			{
				delete: (sessionId: string) => {
					deleted.push(sessionId);
					return true;
				},
			},
			() => {
				closedCount += 1;
			},
		);

		finalize(undefined);
		finalize("session-2");
		finalize("session-2");

		expect(deleted).toEqual(["session-2"]);
		expect(closedCount).toBe(1);
	});
});
