import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { computeStateHash } from "../packages/bardo-engine/src/runtime-contracts";
import { replayCommittedState } from "../packages/bardo-engine/src/runtime-tools";

const REPO_ROOT = "/home/armando/projects/bardo";
const SANDBOX_ROOT =
	process.env.BARDO_STRESS_ROOT?.trim() || "/home/armando/projects/test-bardo-01";
const WORKSPACE_ROOT = path.join(SANDBOX_ROOT, "workspaces", "soak-5000");
const BARDO_BIN =
	process.env.BARDO_BIN?.trim() || path.join(SANDBOX_ROOT, "bin", "bardo");
const TURN_COUNT = Number.parseInt(
	process.env.BARDO_SOAK_TURNS?.trim() || "5004",
	10,
);

const LOCATIONS = ["River Market", "Ash Court", "East Wharf"] as const;
const QUESTS = [
	"Find the ferryman",
	"Secure safe passage before the eclipse",
	"Map the smugglers' route",
] as const;
const FACTIONS = ["Dock Wardens", "Guild of Keys", "Ash Court Watch"] as const;
const CLOCKS = [
	"Eclipse Clock",
	"Ferry Deadline Clock",
	"Watch Patrol Clock",
] as const;
const CHARACTERS = Array.from({ length: 18 }, (_value, index) => {
	return `Harbormaster ${index + 1}`;
});
const RECENT_EVENTS = [
	"Dock ledger shift was logged at River Market.",
	"Dock Wardens tightened inspections at East Wharf.",
	"Guild couriers missed the last ferry bell.",
	"Ash Court Watch rotated the sunset patrol.",
	"The ferryman's skiff was seen near the lower pilings.",
	"Rain made the south cargo path slick after dusk.",
] as const;
const CONSEQUENCE_MARKERS = [
	"checkpoint pressure along the convoy route",
	"lane closures around the ferry queues",
	"informant chatter around the market piers",
] as const;
const RESOURCE_MARKERS = ["ration", "lamp oil", "rope", "bribe coin"] as const;
const DAMAGE_MARKERS = ["fatigue", "strain", "cold", "smoke"] as const;

type CommandResult = {
	status: number;
	stdout: string;
	stderr: string;
};

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

async function runCommand(args: {
	command: string;
	commandArgs: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	expectedStatus?: number;
}): Promise<CommandResult> {
	const child = Bun.spawn([args.command, ...args.commandArgs], {
		cwd: args.cwd,
		env: args.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [status, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const expectedStatus = args.expectedStatus ?? 0;
	if (status !== expectedStatus) {
		throw new Error(
			[
				`${args.command} ${args.commandArgs.join(" ")} exited with status ${status}.`,
				stdout.trim(),
				stderr.trim(),
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
	return { status, stdout, stderr };
}

async function withMcpClient<T>(args: {
	workspaceRoot: string;
	callback: (client: Client) => Promise<T>;
}): Promise<T> {
	const client = new Client(
		{
			name: "mcp-soak-5000",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);
	const transport = new StdioClientTransport({
		command: BARDO_BIN,
		args: ["mcp", "serve", "--workspace-root", args.workspaceRoot],
		cwd: args.workspaceRoot,
		stderr: "pipe",
	});

	try {
		await client.connect(transport);
		return await args.callback(client);
	} finally {
		await client.close();
	}
}

function buildRulebook(): string {
	return [
		"# Shadowdark Travel Notes",
		"",
		"Travel turns should remain conservative.",
		"Clock pressure matters.",
		"Faction consequences should only become canon through validated local state changes.",
	].join("\n");
}

function buildCampaignNotes(): string {
	const lines = [
		"# Long Campaign Notes",
		"",
		"Current location: River Market",
		`Active quest: ${QUESTS[0]}`,
		`Quest: ${QUESTS[1]}`,
		`Quest: ${QUESTS[2]}`,
		`Faction in play: ${FACTIONS[0]}`,
		`Faction: ${FACTIONS[1]}`,
		`Faction: ${FACTIONS[2]}`,
		`Recent event: ${RECENT_EVENTS[0]}`,
		"Fact: The ferryman answers to the Guild of Keys.",
		"Fact: Ash Court closes its inner gate at dusk.",
		`Clock: ${CLOCKS[0]} 1/6`,
		`Clock: ${CLOCKS[1]} 2/6`,
		`Clock: ${CLOCKS[2]} 1/4`,
		"Travel routes extend toward Ash Court after sunset.",
		"Supplies are staged near East Wharf for discreet departures.",
	];
	for (const character of CHARACTERS) {
		lines.push(`Character: ${character}`);
	}
	for (let index = 1; index < RECENT_EVENTS.length; index += 1) {
		lines.push(`Recent event: ${RECENT_EVENTS[index]}`);
	}
	return `${lines.join("\n")}\n`;
}

function readCommittedFlag(value: unknown): boolean {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return (value as { committed?: boolean }).committed === true;
}

function stringifyStructuredContent(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

async function createWorkspace(): Promise<void> {
	await rm(WORKSPACE_ROOT, { recursive: true, force: true });
	await mkdir(WORKSPACE_ROOT, { recursive: true });
	await writeFile(path.join(WORKSPACE_ROOT, "rulebook.md"), buildRulebook(), "utf8");
	await writeFile(
		path.join(WORKSPACE_ROOT, "campaign-notes.md"),
		buildCampaignNotes(),
		"utf8",
	);
}

async function runSoak(): Promise<void> {
	await createWorkspace();
	await runCommand({
		command: BARDO_BIN,
		commandArgs: ["init", "--ruleset", "shadowdark"],
		cwd: WORKSPACE_ROOT,
	});

	const bardoRoot = path.join(WORKSPACE_ROOT, ".bardo");
	const startedAt = Date.now();
	let committedTurns = 0;
	let readOnlyTurns = 0;
	let correctionApplied = false;
	const logInterval = TURN_COUNT <= 100 ? 10 : 250;

	await withMcpClient({
		workspaceRoot: WORKSPACE_ROOT,
		callback: async (client) => {
			const status = await client.callTool({
				name: "bardo_workspace_status",
				arguments: {},
			});
			assert(!status.isError, "bardo_workspace_status failed before the soak.");

			for (let turn = 1; turn <= TURN_COUNT; turn += 1) {
				if (turn === 2501) {
					const correction = await client.callTool({
						name: "user_correction",
						arguments: {
							correction:
								"The party reached Ash Court during the previous convoy and this canon correction should supersede stale River Market references.",
							currentLocation: "Ash Court",
						},
					});
					assert(
						!correction.isError,
						`Turn ${turn}: user_correction crashed during the soak.`,
					);
					assert(
						readCommittedFlag(correction.structuredContent),
						`Turn ${turn}: user_correction did not commit canon. ${stringifyStructuredContent(correction.structuredContent)}`,
					);
					committedTurns += 1;
					correctionApplied = true;
					if (turn % logInterval === 1) {
						console.log(
							`turn ${turn}/${TURN_COUNT}: correction committed after ${Date.now() - startedAt}ms`,
						);
					}
					continue;
				}

				const phase = turn % 4;
				if (phase === 1) {
					const scene = await client.callTool({
						name: "scene_turn",
						arguments: {
							playerIntent: `Scout the docks on long-campaign turn ${turn} without promoting narration into canon.`,
						},
					});
					assert(!scene.isError, `Turn ${turn}: scene_turn crashed.`);
					assert(
						!readCommittedFlag(scene.structuredContent),
						`Turn ${turn}: scene_turn unexpectedly committed canon.`,
					);
					readOnlyTurns += 1;
				} else if (phase === 2) {
					const worldIndex = Math.floor(turn / 4);
					const desiredLocation = correctionApplied
						? "Ash Court"
						: "River Market";
					const quest = QUESTS[worldIndex % QUESTS.length];
					const faction = FACTIONS[worldIndex % FACTIONS.length];
					const event = RECENT_EVENTS[worldIndex % RECENT_EVENTS.length];
					const worldSync = await client.callTool({
						name: "world_sync",
						arguments: {
							currentLocation: desiredLocation,
							activeQuests: [quest],
							relevantFactions: [faction],
							recentEvents: [event],
						},
					});
					assert(!worldSync.isError, `Turn ${turn}: world_sync crashed.`);
					assert(
						readCommittedFlag(worldSync.structuredContent),
						`Turn ${turn}: world_sync failed to commit. ${stringifyStructuredContent(worldSync.structuredContent)}`,
					);
					committedTurns += 1;
				} else if (phase === 3) {
					const simulationIndex = Math.floor(turn / 4);
					const faction = FACTIONS[simulationIndex % FACTIONS.length];
					const character = CHARACTERS[simulationIndex % CHARACTERS.length];
					const clock = CLOCKS[simulationIndex % CLOCKS.length];
					const attitude =
						simulationIndex % 2 === 0 ? "wary but cooperative" : "openly helpful";
					const consequence =
						CONSEQUENCE_MARKERS[simulationIndex % CONSEQUENCE_MARKERS.length];
					const simulation = await client.callTool({
						name: "simulation_tick",
						arguments: {
							tickLabel: `long-soak-tick-${turn}`,
							relevantFactions: [faction],
							factionConsequences: [
								`${faction} increases ${consequence}`,
							],
							npcAttitudes: {
								[character]: attitude,
							},
							clockProgress: [
								`${clock}: checkpoint cycle ${(simulationIndex % 6) + 1}/6`,
							],
						},
					});
					assert(!simulation.isError, `Turn ${turn}: simulation_tick crashed.`);
					assert(
						readCommittedFlag(simulation.structuredContent),
						`Turn ${turn}: simulation_tick failed to commit. ${stringifyStructuredContent(simulation.structuredContent)}`,
					);
					committedTurns += 1;
				} else {
					const playerIndex = Math.floor(turn / 4);
					const playerAction = await client.callTool({
						name: "player_action",
						arguments: {
							action: `Long-campaign action ${turn}: press through the checkpoint and mark the cost.`,
							resourcesSpent: [
								RESOURCE_MARKERS[playerIndex % RESOURCE_MARKERS.length],
							],
							damageTaken: [
								DAMAGE_MARKERS[playerIndex % DAMAGE_MARKERS.length],
							],
						},
					});
					assert(!playerAction.isError, `Turn ${turn}: player_action crashed.`);
					assert(
						readCommittedFlag(playerAction.structuredContent),
						`Turn ${turn}: player_action failed to commit. ${stringifyStructuredContent(playerAction.structuredContent)}`,
					);
					committedTurns += 1;
				}

				if (turn % logInterval === 0) {
					console.log(
						`turn ${turn}/${TURN_COUNT}: committed=${committedTurns} readOnly=${readOnlyTurns} elapsedMs=${Date.now() - startedAt}`,
					);
				}
			}
		},
	});

	const diagnosticsPath = path.join(bardoRoot, "manifests", "diagnostics.json");
	const conflictsPath = path.join(bardoRoot, "manifests", "conflicts.json");
	const currentStatePath = path.join(bardoRoot, "state", "current-state.json");
	const eventLogPath = path.join(bardoRoot, "events", "state-changes.ndjson");
	const snapshotIndexPath = path.join(bardoRoot, "snapshots", "index.json");

	const diagnostics = JSON.parse(await readFile(diagnosticsPath, "utf8")) as {
		latestStateHash?: string | null;
		activeConflictIds?: string[];
		replayStatus?: { canReplayFromEventZero?: boolean; canReplayFromLatestSnapshot?: boolean };
	};
	const conflicts = JSON.parse(await readFile(conflictsPath, "utf8")) as {
		conflicts?: Array<unknown>;
	};
	const currentState = JSON.parse(await readFile(currentStatePath, "utf8")) as Record<
		string,
		unknown
	>;
	const snapshotIndex = JSON.parse(await readFile(snapshotIndexPath, "utf8")) as {
		snapshots?: Array<unknown>;
	};
	const eventLog = await readFile(eventLogPath, "utf8");
	const eventRecords = eventLog
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line) as { eventType?: string });
	const eventCount = eventRecords.length;
	const currentStateHash = computeStateHash(currentState);

	assert(
		eventCount === committedTurns + 1,
		`Expected ${committedTurns + 1} total events including bootstrap, but found ${eventCount} in the event log.`,
	);
	assert(
		eventRecords[0]?.eventType === "bootstrap",
		"The first event in the log must be the bootstrap baseline event.",
	);
	assert(
		(diagnostics.activeConflictIds?.length ?? 0) === 0,
		`Soak ended with active conflicts: ${JSON.stringify(diagnostics.activeConflictIds ?? [])}`,
	);
	assert(
		(conflicts.conflicts?.length ?? 0) === 0,
		"Soak wrote unexpected conflict records.",
	);
	assert(
		diagnostics.latestStateHash === currentStateHash,
		"Diagnostics latestStateHash does not match the final current state hash.",
	);

	const replayFromEvents = await replayCommittedState({
		bardoRoot,
		mode: "events-only",
		dryRun: true,
	});
	const replayFromSnapshot = await replayCommittedState({
		bardoRoot,
		mode: "latest-snapshot",
		dryRun: true,
	});
	assert(
		replayFromSnapshot.stateHash === currentStateHash,
		"Snapshot-tail replay did not rebuild the final current state.",
	);

	const summary = {
		workspaceRoot: WORKSPACE_ROOT,
		bardoRoot,
		turns: TURN_COUNT,
		committedTurns,
		readOnlyTurns,
		eventCount,
		snapshotCount: snapshotIndex.snapshots?.length ?? 0,
		currentStateHash,
		eventZeroReplayMatches: replayFromEvents.stateHash === currentStateHash,
		replayFromEvents,
		replayFromSnapshot,
		diagnosticsReplayStatus: diagnostics.replayStatus ?? null,
		elapsedMs: Date.now() - startedAt,
	};

	const reportPath = path.join(SANDBOX_ROOT, "soak-5000-report.json");
	await writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");

	console.log(JSON.stringify(summary, null, 2));
	console.log(`Soak report written to ${reportPath}`);
}

await runSoak();
