import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { safeParseState } from "../../domain/campaign/state";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const simulationTickInputSchema = z.object({
	mode: z
		.enum(["turn", "scheduled"])
		.default("turn")
		.describe(
			"Tick mode: `turn` for gameplay turns, `scheduled` for queued evolution.",
		),
	tickCount: z
		.number()
		.int()
		.min(1)
		.max(5)
		.default(1)
		.describe("Number of ticks to apply in this call."),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Required for non-dry-run ticks to guarantee safe retries."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("When true, compute tick effects without writing files."),
});

const simulationTickOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	mode: z.enum(["turn", "scheduled"]),
	tickCount: z.number().int().nonnegative(),
	dryRun: z.boolean(),
	idempotentReplay: z.boolean(),
	statePath: z.string(),
	historyPath: z.string(),
	filesTouched: z.array(z.string()),
	entitiesUpdated: z.number().int().nonnegative(),
	factionsUpdated: z.number().int().nonnegative(),
	eventsCreated: z.number().int().nonnegative(),
	stateVersion: z.string(),
	worldTimeBeforeISO: z.string(),
	worldTimeAfterISO: z.string(),
});

type SimulationTickOutput = z.infer<typeof simulationTickOutputSchema>;

type TickEvent = {
	id: string;
	summary: string;
	mode: "turn" | "scheduled";
	tickIndex: number;
	atISO: string;
};

function createDeterministicRng(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value = (value * 1664525 + 1013904223) >>> 0;
		return value / 2 ** 32;
	};
}

function parseSeed(input: string): number {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

async function appendHistoryLine(
	historyPath: string,
	line: string,
): Promise<void> {
	const existing = await readTextIfExists(historyPath);
	const parsed = existing
		? parseMarkdown(existing)
		: { frontmatter: {}, content: "" };
	const nextContent = parsed.content.trim()
		? `${parsed.content.trimEnd()}\n${line}`
		: line;

	await ensureParentDirectoryExists(historyPath);
	await writeFile(
		historyPath,
		renderMarkdown(
			{
				description:
					parsed.frontmatter.description ??
					"Chronological campaign action history log",
				title: parsed.frontmatter.title ?? "Campaign History",
			},
			nextContent,
		),
		"utf8",
	);
}

async function writeEventFile(
	bardoRoot: string,
	event: TickEvent,
): Promise<string> {
	const eventPath = resolvePathInsideRoot(
		bardoRoot,
		`world/events/${event.id}.md`,
	);
	const existing = await readTextIfExists(eventPath);
	if (existing !== null) {
		return eventPath;
	}

	await ensureParentDirectoryExists(eventPath);
	await writeFile(
		eventPath,
		renderMarkdown(
			{
				description: "Autonomous simulation event",
				title: `Simulation Event ${event.id}`,
			},
			JSON.stringify(
				{
					id: event.id,
					type: "simulation_tick",
					mode: event.mode,
					tickIndex: event.tickIndex,
					atISO: event.atISO,
					summary: event.summary,
				},
				null,
				2,
			),
		),
		"utf8",
	);
	return eventPath;
}

export function registerSimulationTickTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"simulation_tick",
		{
			title: "Simulation Tick",
			description:
				"Advance world simulation deterministically for one or more bounded ticks and persist resulting state/history/events.",
			inputSchema: simulationTickInputSchema,
			outputSchema: simulationTickOutputSchema,
			annotations: {
				title: "Simulation Tick",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ mode, tickCount, idempotencyKey, dryRun }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
			const historyPath = resolvePathInsideRoot(bardoRoot, "state/history.md");

			try {
				if (!dryRun && !idempotencyKey) {
					throw new Error("`idempotencyKey` is required when dryRun is false.");
				}

				if (!dryRun && idempotencyKey) {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "simulation_tick",
					});
					if (replay) {
						return makeToolResult({
							...(replay as SimulationTickOutput),
							idempotentReplay: true,
						});
					}
				}

				const rawState = await readTextIfExists(statePath);
				const parsedState = rawState
					? parseMarkdown(rawState)
					: { frontmatter: {}, content: "" };
				const state = safeParseState(parsedState.content);
				const worldTimeBeforeISO = state.worldTimeISO;
				const now = new Date(worldTimeBeforeISO);
				const filesTouched = new Set<string>();
				let eventsCreated = 0;
				const entitiesUpdated = 0;
				const factionsUpdated = 0;

				const rng = createDeterministicRng(
					parseSeed(
						`${idempotencyKey ?? "dry-run"}:${worldTimeBeforeISO}:${mode}`,
					),
				);

				for (let i = 0; i < tickCount; i += 1) {
					const minutes = mode === "turn" ? 15 : 60;
					now.setMinutes(now.getMinutes() + minutes);
					const atISO = now.toISOString();
					const locationKeys = Object.keys(state.locations);
					const selectedLocation =
						locationKeys.length > 0
							? locationKeys[Math.floor(rng() * locationKeys.length)] ||
								"unknown"
							: "starting-area";
					const event: TickEvent = {
						id: `sim-${atISO.replaceAll(/[:.]/g, "-")}-${i + 1}`,
						summary: `Autonomous world evolution progressed near ${selectedLocation}.`,
						mode,
						tickIndex: i + 1,
						atISO,
					};

					if (!dryRun) {
						const eventPath = await writeEventFile(bardoRoot, event);
						filesTouched.add(eventPath);
					}
					eventsCreated += 1;
				}

				state.worldTimeISO = now.toISOString();
				state.lastAction = `simulation_tick:${mode}`;

				if (!dryRun) {
					await ensureParentDirectoryExists(statePath);
					await writeFile(
						statePath,
						renderMarkdown(
							{
								description: "Current campaign state and memory snapshot",
								title: "Campaign State",
							},
							JSON.stringify(state, null, 2),
						),
						"utf8",
					);
					filesTouched.add(statePath);

					const historyLine =
						`${new Date().toISOString()} | intent=simulate | action="simulation_tick" | ` +
						`mode=${mode} | ticks=${tickCount} | events=${eventsCreated}`;
					await appendHistoryLine(historyPath, historyLine);
					filesTouched.add(historyPath);
				}

				const output: SimulationTickOutput = {
					success: true,
					message: dryRun
						? "Simulation tick dry-run computed successfully."
						: "Simulation tick applied successfully.",
					rootPath: bardoRoot,
					mode,
					tickCount,
					dryRun,
					idempotentReplay: false,
					statePath,
					historyPath,
					filesTouched: [...filesTouched],
					entitiesUpdated,
					factionsUpdated,
					eventsCreated,
					stateVersion: `${state.worldTimeISO}:${mode}:${tickCount}`,
					worldTimeBeforeISO,
					worldTimeAfterISO: state.worldTimeISO,
				};

				if (!dryRun && idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "simulation_tick",
						result: output,
						nowIso: new Date().toISOString(),
					});
				}

				return makeToolResult(output);
			} catch (error) {
				const output: SimulationTickOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to run simulation tick: ${error.message}`
							: "Failed to run simulation tick.",
					rootPath: bardoRoot,
					mode,
					tickCount,
					dryRun,
					idempotentReplay: false,
					statePath,
					historyPath,
					filesTouched: [],
					entitiesUpdated: 0,
					factionsUpdated: 0,
					eventsCreated: 0,
					stateVersion: "",
					worldTimeBeforeISO: "",
					worldTimeAfterISO: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
