import { describe, expect, test } from "bun:test";
import { parseInitBootstrapPayload } from "./init-bootstrap-orchestrator";

describe("parseInitBootstrapPayload", () => {
	test("accepts empty payload", () => {
		const parsed = parseInitBootstrapPayload({});
		expect(parsed).toEqual({});
	});

	test("accepts bootstrap answers payload", () => {
		const parsed = parseInitBootstrapPayload({
			answers: {
				purpose: "Run a grounded TTRPG simulation.",
			},
			workspaceId: "main",
		});

		expect(parsed.answers?.purpose).toContain("grounded");
		expect(parsed.workspaceId).toBe("main");
	});

	test("rejects invalid payload shape", () => {
		expect(() =>
			parseInitBootstrapPayload({
				answers: "invalid",
			}),
		).toThrow("Invalid init bootstrap payload");
	});
});
