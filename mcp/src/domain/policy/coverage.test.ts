import { describe, expect, test } from "bun:test";
import {
	isToolAllowed,
	resolveEffectiveToolPolicy,
	resolveToolPolicyConfig,
} from "../config/tool-policy";
import { POLICY_COVERAGE } from "./coverage";

describe("policy coverage inventory", () => {
	test("defines unique canon-affecting path entries with rationale", () => {
		const ids = new Set<string>();
		for (const entry of POLICY_COVERAGE) {
			expect(entry.pathId.length).toBeGreaterThan(0);
			expect(entry.rationale.length).toBeGreaterThan(0);
			expect(ids.has(entry.pathId)).toBe(false);
			ids.add(entry.pathId);
		}
		expect(POLICY_COVERAGE.length).toBeGreaterThanOrEqual(6);
	});

	test("keeps profile_blocked entries unavailable in gameplay profile", () => {
		const gameplayPolicy = resolveEffectiveToolPolicy(
			resolveToolPolicyConfig({
				BARDO_TOOLS_PROFILE: "gameplay",
			}),
			{
				providerId: null,
				modelId: null,
			},
		);

		for (const entry of POLICY_COVERAGE) {
			if (entry.kind !== "tool" || entry.status !== "profile_blocked") {
				continue;
			}
			expect(isToolAllowed(gameplayPolicy, entry.pathId)).toBe(false);
		}
	});

	test("keeps guarded entries available in standard profile", () => {
		const standardPolicy = resolveEffectiveToolPolicy(
			resolveToolPolicyConfig({
				BARDO_TOOLS_PROFILE: "standard",
			}),
			{
				providerId: null,
				modelId: null,
			},
		);

		for (const entry of POLICY_COVERAGE) {
			if (entry.kind !== "tool" || entry.status !== "guarded") {
				continue;
			}
			expect(isToolAllowed(standardPolicy, entry.pathId)).toBe(true);
		}
	});
});
