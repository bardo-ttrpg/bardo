import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJsonObject } from "../../../domain/campaign/json";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../../telemetry";
import { resolveInitPaths } from "./paths";
import { runGuidedSetupFlow } from "./setup-flow";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function markBootstrapComplete(bardoRoot: string): Promise<void> {
	const paths = resolveInitPaths(bardoRoot);
	await writeFile(
		paths.identityPath,
		renderMarkdown(
			{
				title: "Identity",
				description: "Agent identity",
				bootstrapStatus: "complete",
			},
			"# Identity",
		),
		"utf8",
	);
	await writeFile(
		paths.userPath,
		renderMarkdown(
			{
				title: "User",
				description: "User profile",
				bootstrapStatus: "complete",
			},
			"# User",
		),
		"utf8",
	);
}

describe("runGuidedSetupFlow", () => {
	test("asks exact system question after bootstrap completion", async () => {
		const root = await makeTempRoot("bardo-setup-question-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const result = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
			incomingAction: "I enter the tavern",
		});

		expect(result.status).toBe("needs_input");
		expect(result.questionKey).toBe("ttrpgSystem");
		expect(result.question).toContain("What system are we using?");
		expect(result.question).toContain("Standard dice rolling");
		expect(result.question).toContain("Narrative only");
		expect(result.question).toContain("Custom system");
		expect(result.question).toContain("Type your own answer");
		expect(result.pendingAction).toBe("I enter the tavern");

		await rm(root, { recursive: true, force: true });
	});

	test("asks dice roller question with explicit options", async () => {
		const root = await makeTempRoot("bardo-setup-dice-question-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const first = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
			incomingAction: "I enter the tavern",
		});
		expect(first.status).toBe("needs_input");
		expect(first.questionKey).toBe("ttrpgSystem");

		const second = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:01.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				ttrpgSystem: "Standard dice rolling",
				sourceMaterialsStatus: "none",
			},
		});

		expect(second.status).toBe("needs_input");
		expect(second.questionKey).toBe("diceRoller");
		expect(second.question).toContain("Who rolls the dice?");
		expect(second.question).toContain(
			"Every player rolls his own character dice (Recommended)",
		);
		expect(second.question).toContain("Bardo rolls all dice");
		expect(second.question).toContain("Type your own answer");

		await rm(root, { recursive: true, force: true });
	});

	test("completes setup and returns pending action in same call", async () => {
		const root = await makeTempRoot("bardo-setup-complete-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const first = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
			incomingAction: "I enter the tavern",
		});
		expect(first.status).toBe("needs_input");

		const completed = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:01.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				ttrpgSystem: "Dungeons & Dragons 5e",
				sourceMaterialsStatus: "partial",
				diceRoller: "player",
				playerCount: 4,
			},
		});

		expect(completed.status).toBe("complete");
		expect(completed.actionToExecute).toBe("I enter the tavern");
		expect(completed.pendingAction).toBeNull();

		await rm(root, { recursive: true, force: true });
	});

	test("returns conflict when expected revision is stale", async () => {
		const root = await makeTempRoot("bardo-setup-revision-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const first = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
			incomingAction: "I enter the tavern",
		});

		const second = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:01.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				ttrpgSystem: "D&D",
			},
		});
		expect(second.revision).toBeGreaterThan(first.revision);

		const stale = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:02.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				diceRoller: "player",
			},
		});

		expect(stale.status).toBe("needs_input");
		expect(stale.conflict.detected).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("writes scan cache and keeps it stable for unchanged files", async () => {
		const root = await makeTempRoot("bardo-setup-scan-cache-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		const paths = resolveInitPaths(bardoRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await mkdir(path.join(bardoRoot, "rules/sources/rulebook"), {
			recursive: true,
		});
		await writeFile(
			path.join(bardoRoot, "rules/sources/rulebook/core-rules.md"),
			"# Core Rules\nThis rulebook defines core rules and character sheet basics.",
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const first = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
		});
		expect(first.status).toBe("needs_input");

		const firstScanCacheRaw = await readFile(paths.scanCachePath, "utf8");
		const firstScanCache = parseJsonObject(
			parseMarkdown(firstScanCacheRaw).content.trim(),
		) as {
			updatedAtISO?: string;
			files?: Array<{ path?: string }>;
		};
		expect(firstScanCache.updatedAtISO).toBe("2026-02-22T00:00:00.000Z");
		expect(firstScanCache.files?.some((entry) => entry.path)).toBe(true);

		await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:01.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				ttrpgSystem: "Dungeons & Dragons 5e",
			},
		});

		const secondScanCacheRaw = await readFile(paths.scanCachePath, "utf8");
		const secondScanCache = parseJsonObject(
			parseMarkdown(secondScanCacheRaw).content.trim(),
		) as {
			updatedAtISO?: string;
		};
		expect(secondScanCache.updatedAtISO).toBe("2026-02-22T00:00:00.000Z");

		await rm(root, { recursive: true, force: true });
	});

	test("records setup flow and scan cache telemetry", async () => {
		resetTelemetryForTests();
		const root = await makeTempRoot("bardo-setup-metrics-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await mkdir(path.join(bardoRoot, "rules/sources/rulebook"), {
			recursive: true,
		});
		await writeFile(
			path.join(bardoRoot, "rules/sources/rulebook/core-rules.md"),
			"# Core Rules\nThis rulebook defines core rules and character sheet basics.",
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await markBootstrapComplete(bardoRoot);

		const first = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
		});
		await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:01.000Z",
			expectedRevision: first.revision,
			setupAnswers: {
				ttrpgSystem: "Dungeons & Dragons 5e",
			},
		});

		const metrics = renderPrometheusMetrics();
		expect(metrics).toContain("bardo_setup_runs_total");
		expect(metrics).toContain("bardo_setup_duration_ms");
		expect(metrics).toContain("bardo_setup_scan_cache_events_total");
		expect(metrics).toContain(
			'bardo_setup_scan_cache_events_total{outcome="miss"}',
		);
		expect(metrics).toContain(
			'bardo_setup_scan_cache_events_total{outcome="hit"}',
		);

		await rm(root, { recursive: true, force: true });
	});

	test("recovers from malformed scan cache state", async () => {
		const root = await makeTempRoot("bardo-setup-scan-cache-malformed-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		const paths = resolveInitPaths(bardoRoot);
		await mkdir(path.join(bardoRoot, "_settings"), { recursive: true });
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await mkdir(path.join(bardoRoot, "rules/sources/rulebook"), {
			recursive: true,
		});
		await writeFile(
			path.join(bardoRoot, "rules/sources/rulebook/core-rules.md"),
			"# Core Rules\nThis rulebook defines core rules and character sheet basics.",
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "_settings/settings.md"),
			renderMarkdown(
				{ title: "Settings", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{ title: "State", description: "test" },
				JSON.stringify({}, null, 2),
			),
			"utf8",
		);
		await writeFile(
			path.join(bardoRoot, "state/history.md"),
			renderMarkdown({ title: "History", description: "test" }, ""),
			"utf8",
		);
		await writeFile(paths.scanCachePath, "not-json", "utf8");
		await markBootstrapComplete(bardoRoot);

		const result = await runGuidedSetupFlow({
			campaignBasePath: campaignRoot,
			nowIso: "2026-02-22T00:00:00.000Z",
		});
		expect(result.status).toBe("needs_input");

		const scanCacheRaw = await readFile(paths.scanCachePath, "utf8");
		const scanCache = parseJsonObject(
			parseMarkdown(scanCacheRaw).content.trim(),
		) as {
			version?: number;
			files?: Array<{ path?: string }>;
		} | null;
		expect(scanCache?.version).toBe(1);
		expect(scanCache?.files?.some((entry) => entry.path)).toBe(true);

		await rm(root, { recursive: true, force: true });
	});
});
