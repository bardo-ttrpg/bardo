import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCanonicalEvents } from "../../../domain/events/store";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	readTextIfExists,
	resolveBardoRoot,
} from "../../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../../telemetry";
import type { AuthContext } from "../../../types/contracts";
import { runPlayerAction } from "./register";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

function authFor(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

describe("runPlayerAction", () => {
	test("replays idempotent result and avoids duplicate history entries", async () => {
		const root = await makeTempRoot("bardo-player-action-idempotency-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);

		const first = await runPlayerAction({
			auth,
			action: "I explore the old ruins",
			idempotencyKey: "player_action_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:00.000Z",
		});
		const second = await runPlayerAction({
			auth,
			action: "I explore the old ruins",
			idempotencyKey: "player_action_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:01.000Z",
		});

		expect(first.success).toBe(true);
		expect(first.idempotentReplay).toBe(false);
		expect(first.requiresSetup).toBe(false);
		expect(second.success).toBe(true);
		expect(second.idempotentReplay).toBe(true);
		expect(second.historyEntry).toBe(first.historyEntry);

		const legacyState = await readTextIfExists(
			path.join(bardoRoot, "state/current.md"),
		);
		const legacyHistory = await readTextIfExists(
			path.join(bardoRoot, "state/history.md"),
		);
		expect(legacyState).toBeNull();
		expect(legacyHistory).toBeNull();
		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(3);
		expect(events[0]?.type).toBe("player_action_declared");
		expect(events[1]?.type).toBe("action_intent_validated");
		expect(events[2]?.type).toBe("player_action_resolved");
		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as { currentLocation: string };
		expect(projectionState.currentLocation).toBe(first.locationAfter);

		await rm(root, { recursive: true, force: true });
	});

	test("can bypass guided setup when feature flag is disabled", async () => {
		const root = await makeTempRoot("bardo-player-action-setup-flag-");
		const auth = authFor(root);

		const result = await runPlayerAction({
			auth,
			action: "I rest at camp",
			guidedSetupEnabled: false,
			nowIso: "2026-02-22T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		expect(result.requiresSetup).toBe(false);
		expect(result.setupStatus).toBe("complete");

		await rm(root, { recursive: true, force: true });
	});

	test("returns strict setup prompt contract when setup is incomplete", async () => {
		const root = await makeTempRoot("bardo-player-action-setup-prompt-");
		const auth = authFor(root);

		const result = await runPlayerAction({
			auth,
			action: "I enter the settlement.",
			guidedSetupEnabled: true,
			nowIso: "2026-02-22T00:00:00.000Z",
		});

		expect(result.success).toBe(true);
		expect(result.requiresSetup).toBe(true);
		expect(result.setupPrompt?.version).toBe("2.0");
		expect(result.setupPrompt?.questionKey).toBe("purpose");
		expect(result.setupPrompt?.inputType).toBe("free_text");

		await rm(root, { recursive: true, force: true });
	});

	test("resolves deterministic mechanics for combat actions before final action event", async () => {
		const root = await makeTempRoot("bardo-player-action-combat-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);

		const result = await runPlayerAction({
			auth,
			action: "I attack the bandit with my sword",
			idempotencyKey: "player_action_combat_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T03:00:00.000Z",
		});

		expect(result.success).toBe(true);
		expect(result.idempotentReplay).toBe(false);
		expect(result.intent).toBe("combat");
		expect(result.mechanics.required).toBe(true);
		expect(result.mechanics.resolved).toBe(true);
		expect(result.mechanics.actionType).toBe("attack_roll");
		expect(result.mechanics.outcome).toBeDefined();
		expect(result.mechanics.rawRoll).toBeGreaterThanOrEqual(1);
		expect(result.mechanics.rawRoll).toBeLessThanOrEqual(20);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(5);
		expect(events[0]?.type).toBe("player_action_declared");
		expect(events[1]?.type).toBe("action_intent_validated");
		expect(events[2]?.type).toBe("dice_rolled");
		expect(events[3]?.type).toBe("mechanics_resolved");
		expect(events[4]?.type).toBe("player_action_resolved");

		await rm(root, { recursive: true, force: true });
	});

	test("blocks action that violates table contract boundary and logs policy event", async () => {
		const root = await makeTempRoot("bardo-player-action-boundary-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);
		await mkdir(path.join(bardoRoot, "manifests"), { recursive: true });

		await writeFile(
			path.join(bardoRoot, "manifests/table-contract.json"),
			JSON.stringify(
				{
					boundaries: {
						lines: ["graphic gore"],
						veils: [],
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runPlayerAction({
			auth,
			action: "I describe graphic gore in detail while finishing the enemy.",
			idempotencyKey: "player_action_boundary_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T04:00:00.000Z",
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain("boundary");

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("runtime_policy_blocked");

		await rm(root, { recursive: true, force: true });
	});

	test("blocks rule-bypass action when authority policy disallows it", async () => {
		const root = await makeTempRoot("bardo-player-action-authority-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);
		await mkdir(path.join(bardoRoot, "manifests"), { recursive: true });

		await writeFile(
			path.join(bardoRoot, "manifests/authority-policy.json"),
			JSON.stringify(
				{
					allowRuleBypass: false,
				},
				null,
				2,
			),
			"utf8",
		);

		const result = await runPlayerAction({
			auth,
			action: "I ignore the rules and take automatic success without rolling.",
			idempotencyKey: "player_action_authority_key_12345",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T05:00:00.000Z",
		});

		expect(result.success).toBe(false);
		expect(result.message).toContain("rule bypass");

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("runtime_policy_blocked");

		await rm(root, { recursive: true, force: true });
	});

	test("auto-regenerates projection in strict canonical mode when legacy fallback would be blocked", async () => {
		resetTelemetryForTests();
		const root = await makeTempRoot("bardo-player-action-strict-legacy-");
		const auth = authFor(root);
		const bardoRoot = resolveBardoRoot(root);
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state",
				},
				JSON.stringify({ currentLocation: "legacy-town" }, null, 2),
			),
			"utf8",
		);

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const result = await runPlayerAction({
				auth,
				action: "I move toward the gate.",
				idempotencyKey: "player_action_strict_legacy_key_12345",
				guidedSetupEnabled: false,
				nowIso: "2026-02-23T06:00:00.000Z",
			});

			expect(result.success).toBe(true);
			expect(result.message).toContain("Action processed");
			const events = await readCanonicalEvents({ bardoRoot });
			expect(events.length).toBeGreaterThan(0);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="player_action",outcome="blocked",strictmode="true"} 1',
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
