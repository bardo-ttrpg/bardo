import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapCampaignWorkspace } from "./campaign-bootstrap";
import {
	createRuntimeToolHandlers,
	replayCommittedState,
} from "./runtime-tools";
import { resolveBardoRoot } from "./workspace";

function requireRuntimeHandler(
	handlers: ReturnType<typeof createRuntimeToolHandlers>,
	name: string,
) {
	const handler = handlers[name];
	if (typeof handler !== "function") {
		throw new Error(`Missing runtime tool handler: ${name}`);
	}
	return handler;
}

type RuntimeEvalScenarioId =
	| "missing_campaign_state"
	| "contradictory_sources"
	| "explicit_correction_repair"
	| "messy_workspace_extraction";

type RuntimeEvalResult = {
	scenarioId: RuntimeEvalScenarioId;
	passed: boolean;
	metrics: {
		replayHashConverged: boolean;
		blockedInvalidCommitCount: number;
		correctionSurvived: boolean;
		unresolvedConflictCount: number;
		duplicateCandidateCount: number;
	};
	notes: string[];
};

export async function runRuntimeEvalScenario(
	scenarioId: RuntimeEvalScenarioId,
): Promise<RuntimeEvalResult> {
	const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-eval-"));
	const bardoRoot = resolveBardoRoot(workspaceRoot);
	const handlers = createRuntimeToolHandlers();
	let blockedInvalidCommitCount = 0;
	const notes: string[] = [];

	try {
		await mkdir(path.join(bardoRoot, "rules/normalized"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "rules/normalized/index.json"),
			JSON.stringify({
				schemaVersion: 2,
				recommendedSimulationDepth: "standard",
				sections: [],
			}),
			"utf8",
		);

		switch (scenarioId) {
			case "missing_campaign_state":
				await writeFile(
					path.join(workspaceRoot, "campaign.md"),
					"# Notes\n\nFaction in play: Guild of Keys",
					"utf8",
				);
				await bootstrapCampaignWorkspace({
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-05-01T00:00:00.000Z",
				});
				break;
			case "contradictory_sources":
				await writeFile(
					path.join(workspaceRoot, "session-a.md"),
					"Current location: River Market\nQuest: Find the ferryman",
					"utf8",
				);
				await writeFile(
					path.join(workspaceRoot, "session-b.md"),
					"Current location: Ash Court\nQuest: Find the ferryman",
					"utf8",
				);
				await bootstrapCampaignWorkspace({
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-05-01T00:00:00.000Z",
				});
				break;
			case "explicit_correction_repair": {
				await writeFile(
					path.join(workspaceRoot, "campaign.md"),
					[
						"Current location: River Market",
						"Quest: Find the ferryman",
						"Faction in play: Guild of Keys",
						"Mira believes the ferryman is hiding near Ash Court.",
					].join("\n"),
					"utf8",
				);
				await bootstrapCampaignWorkspace({
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-05-01T00:00:00.000Z",
				});
				const committed = await requireRuntimeHandler(handlers, "world_sync")(
					{ currentLocation: "Ash Court", activeQuests: ["Find the ferryman"] },
					{ workspaceRoot, bardoRoot, nowIso: "2026-05-01T01:00:00.000Z" },
				);
				await requireRuntimeHandler(handlers, "user_correction")(
					{
						correction: "The party never left River Market.",
						currentLocation: "River Market",
						correctionType: "backdated_correction",
						supersedesEventId:
							typeof committed.eventId === "string" ? committed.eventId : null,
					},
					{ workspaceRoot, bardoRoot, nowIso: "2026-05-01T02:00:00.000Z" },
				);
				break;
			}
			case "messy_workspace_extraction":
				await writeFile(
					path.join(workspaceRoot, "notes.md"),
					[
						"# Session 12",
						"",
						"Current location: Ash Court",
						"Faction in play: Guild of Keys",
						"Faction in play: Guild  of Keys",
						"NPC attitude: Mira -> wary",
						"Clock progress: Eclipse Clock advanced to 2/6.",
					].join("\n"),
					"utf8",
				);
				await bootstrapCampaignWorkspace({
					workspaceRoot,
					bardoRoot,
					nowIso: "2026-05-01T00:00:00.000Z",
				});
				break;
		}

		if (scenarioId !== "explicit_correction_repair") {
			try {
				const blocked = await requireRuntimeHandler(handlers, "world_sync")(
					{ currentLocation: "Unknown Vault" },
					{ workspaceRoot, bardoRoot, nowIso: "2026-05-01T03:00:00.000Z" },
				);
				if (blocked.committed === false) {
					blockedInvalidCommitCount += 1;
				}
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("needs-user-input")
				) {
					blockedInvalidCommitCount += 1;
					notes.push(
						"Mutation remained blocked until bootstrap readiness gaps were resolved.",
					);
				} else {
					throw error;
				}
			}
		}

		const replay = await replayCommittedState({
			bardoRoot,
			mode: "latest-snapshot",
			dryRun: true,
		});
		const currentState = JSON.parse(
			await readFile(path.join(bardoRoot, "state/current-state.json"), "utf8"),
		) as { currentLocation?: string };
		const conflicts = JSON.parse(
			await readFile(
				path.join(bardoRoot, "manifests/conflicts.json"),
				"utf8",
			).catch(() => '{"conflicts":[]}'),
		) as { conflicts?: Array<{ resolutionStatus?: string }> };
		const diagnostics = JSON.parse(
			await readFile(
				path.join(bardoRoot, "manifests/diagnostics.json"),
				"utf8",
			).catch(() => "{}"),
		) as { latestStateHash?: string };
		const entities = JSON.parse(
			await readFile(
				path.join(bardoRoot, "entities/campaign-entities.json"),
				"utf8",
			),
		) as { records?: Record<string, unknown> };
		const duplicateCandidateCount = JSON.stringify(
			entities.records ?? {},
		).includes("Guild  of Keys")
			? 1
			: 0;

		if (scenarioId === "contradictory_sources") {
			notes.push(
				"Expected readiness with explicit uncertainty about current location.",
			);
		}

		return {
			scenarioId,
			passed:
				replay.stateHash === diagnostics.latestStateHash ||
				diagnostics.latestStateHash === undefined,
			metrics: {
				replayHashConverged:
					replay.stateHash === diagnostics.latestStateHash ||
					diagnostics.latestStateHash === undefined,
				blockedInvalidCommitCount,
				correctionSurvived:
					scenarioId !== "explicit_correction_repair" ||
					(replay.currentState.currentLocation === "River Market" &&
						currentState.currentLocation === "River Market"),
				unresolvedConflictCount: Array.isArray(conflicts.conflicts)
					? conflicts.conflicts.filter(
							(entry) => entry.resolutionStatus !== "resolved",
						).length
					: 0,
				duplicateCandidateCount,
			},
			notes,
		};
	} finally {
		await rm(workspaceRoot, { recursive: true, force: true });
	}
}
