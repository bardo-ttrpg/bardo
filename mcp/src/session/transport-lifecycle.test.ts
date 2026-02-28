import { describe, expect, test } from "bun:test";
import {
	createAndHandleStatelessRequest,
	createSessionFinalizer,
} from "./transport-lifecycle";

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

	test("stateless transport handles tools/list without emitting session id", async () => {
		const response = await createAndHandleStatelessRequest(
			new Request("http://localhost:3000/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
			}),
			{
				apiKey: "test-key",
				campaignBasePath: process.cwd(),
			},
			{
				enableJsonResponse: true,
			},
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("mcp-session-id")).toBeNull();
		const body = (await response.json()) as {
			result?: { tools?: Array<{ name?: string }> };
		};
		expect(Array.isArray(body.result?.tools)).toBe(true);
		expect(
			body.result?.tools?.some((tool) => tool.name === "sessions_list"),
		).toBe(false);
	});
});
