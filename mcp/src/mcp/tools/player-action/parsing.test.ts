import { describe, expect, test } from "bun:test";
import { extractTargetLocation } from "./parsing";

describe("extractTargetLocation", () => {
	test("parses toward targets without truncating them into ward", () => {
		expect(
			extractTargetLocation(
				"I leave the tavern and head toward the last known location of the disappearance.",
			),
		).toBe("last known location of the disappearance");
	});
});
