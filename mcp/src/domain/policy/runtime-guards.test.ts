import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "./runtime-guards";

describe("runtime policy guards", () => {
	test("loads default table contract and authority policy when manifests are missing", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-policy-defaults-"),
		);
		const bardoRoot = path.join(root, "bardo");

		const tableContract = await loadTableContract({ bardoRoot });
		const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });

		expect(tableContract.boundaries.lines.length).toBeGreaterThan(0);
		expect(authorityPolicy.allowRuleBypass).toBe(false);

		await rm(root, { recursive: true, force: true });
	});

	test("evaluates boundary and authority violations from action text", () => {
		const violations = evaluateRuntimePolicy({
			action:
				"I ignore the rules and claim automatic success while adding graphic gore.",
			tableContract: {
				tone: "heroic-fantasy",
				boundaries: {
					lines: ["graphic gore"],
					veils: [],
				},
				pvp: "requires-consent",
				retconPolicy: "table-consensus",
			},
			authorityPolicy: {
				mode: "traditional-gm",
				factIntroduction: "gm_with_player_input",
				ruleAdjudication: "gm_with_override_logging",
				safetyVeto: "any_participant",
				allowRuleBypass: false,
				allowUnilateralRetcon: false,
				allowPlayerCanonDeclarations: false,
			},
		});

		expect(
			violations.some(
				(violation) => violation.code === "CONTENT_BOUNDARY_LINE",
			),
		).toBe(true);
		expect(
			violations.some(
				(violation) => violation.code === "RULE_BYPASS_DISALLOWED",
			),
		).toBe(true);
		expect(summarizeRuntimePolicyViolations(violations)).toContain(
			"Runtime policy blocked action",
		);
	});

	test("loads configured manifest overrides", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-policy-custom-"));
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "manifests"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "manifests/table-contract.json"),
			JSON.stringify(
				{
					boundaries: {
						lines: ["body horror"],
						veils: ["torture"],
					},
				},
				null,
				2,
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "manifests/authority-policy.json"),
			JSON.stringify(
				{
					allowRuleBypass: true,
				},
				null,
				2,
			),
			"utf8",
		);

		const tableContract = await loadTableContract({ bardoRoot });
		const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });

		expect(tableContract.boundaries.lines).toContain("body horror");
		expect(tableContract.boundaries.veils).toContain("torture");
		expect(authorityPolicy.allowRuleBypass).toBe(true);

		await rm(root, { recursive: true, force: true });
	});
});
