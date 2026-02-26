import { describe, expect, test } from "bun:test";
import { listRulesetAdapters, resolveRulesetAdapter } from "./registry";

describe("ruleset adapter registry", () => {
	test("exposes d20_v1 and narrative_v1 adapters", () => {
		const ids = listRulesetAdapters().map((adapter) => adapter.id);
		expect(ids).toContain("d20_v1");
		expect(ids).toContain("narrative_v1");
	});

	test("throws for unsupported ruleset ids", () => {
		expect(() => resolveRulesetAdapter("unknown_ruleset")).toThrow(
			"Unsupported ruleset",
		);
	});
});
