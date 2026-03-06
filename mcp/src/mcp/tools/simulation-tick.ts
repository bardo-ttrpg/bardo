import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { appendCanonicalEvent } from "../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../domain/policy/runtime-guards";
import { loadPreferredCurrentState } from "../../domain/projections/preferred-state";
import { regenerateProjectionsForEventTypes } from "../../domain/projections/refresh";
import { withKeyedLock } from "../../infra/concurrency/keyed-lock";
import {
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

function canonicalSimulationTickEventId(
	idempotencyKey: string | undefined,
): string {
	if (!idempotencyKey) {
		return `evt-simulation-tick-${crypto.randomUUID()}`;
	}
	const normalized = idempotencyKey
		.toLowerCase()
		.replaceAll(/[^a-z0-9_-]/g, "-")
		.slice(0, 80);
	return `evt-simulation-tick-${normalized}`;
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
				"Advance world simulation deterministically for one or more bounded ticks and persist canonical events/projections.",
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
			const canonicalLogPath = resolvePathInsideRoot(
				bardoRoot,
				"events/canonical.ndjson",
			);

			try {
				return await withKeyedLock(
					`workspace-mutation:${bardoRoot}`,
					async () => {
						if (!dryRun && !idempotencyKey) {
							throw new Error(
								"`idempotencyKey` is required when dryRun is false.",
							);
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

						const tableContract = await loadTableContract({ bardoRoot });
						const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
						const policyAction = `simulation_tick mode=${mode} tickCount=${String(tickCount)}`;
						const runtimeViolations = evaluateRuntimePolicy({
							action: policyAction,
							tableContract,
							authorityPolicy,
						});
						if (runtimeViolations.length > 0) {
							const blockedMessage =
								summarizeRuntimePolicyViolations(runtimeViolations);
							const nowIso = new Date().toISOString();
							await appendCanonicalEvent({
								bardoRoot,
								event: {
									id: `evt-simulation-tick-policy-${crypto.randomUUID()}`,
									type: "runtime_policy_blocked",
									atISO: nowIso,
									source: "simulation_tick",
									data: {
										action: policyAction,
										mode,
										tickCount,
										runtimeViolations,
										tableContract: {
											tone: tableContract.tone,
											boundaries: tableContract.boundaries,
											pvp: tableContract.pvp,
											retconPolicy: tableContract.retconPolicy,
										},
										authorityPolicy: {
											mode: authorityPolicy.mode,
											factIntroduction: authorityPolicy.factIntroduction,
											ruleAdjudication: authorityPolicy.ruleAdjudication,
											safetyVeto: authorityPolicy.safetyVeto,
											allowRuleBypass: authorityPolicy.allowRuleBypass,
											allowUnilateralRetcon:
												authorityPolicy.allowUnilateralRetcon,
											allowPlayerCanonDeclarations:
												authorityPolicy.allowPlayerCanonDeclarations,
										},
									},
								},
							});
							const output: SimulationTickOutput = {
								success: false,
								message: `Simulation tick blocked by runtime policy: ${blockedMessage}`,
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

							if (!dryRun && idempotencyKey) {
								await setIdempotentResult({
									bardoRoot,
									key: idempotencyKey,
									scope: "simulation_tick",
									result: output,
									nowIso,
								});
							}

							return makeToolResult(output, true);
						}

						const preferredState = await loadPreferredCurrentState({
							bardoRoot,
							consumer: "simulation_tick",
							refreshStaleProjection: true,
						});
						const state = JSON.parse(
							JSON.stringify(preferredState.chosen.state),
						) as typeof preferredState.chosen.state;
						const worldTimeBeforeISO = state.worldTimeISO;
						const now = new Date(worldTimeBeforeISO);
						const filesTouched = new Set<string>();
						const sampledLocations: string[] = [];
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
							const locationKeys = Object.keys(state.locations);
							const selectedLocation =
								locationKeys.length > 0
									? locationKeys[Math.floor(rng() * locationKeys.length)] ||
										"unknown"
									: "starting-area";
							sampledLocations.push(selectedLocation);
						}

						state.worldTimeISO = now.toISOString();
						state.lastAction = `simulation_tick:${mode}`;

						if (!dryRun) {
							const canonicalAtISO = new Date().toISOString();
							await appendCanonicalEvent({
								bardoRoot,
								event: {
									id: canonicalSimulationTickEventId(idempotencyKey),
									type: "simulation_tick_applied",
									atISO: canonicalAtISO,
									source: "simulation_tick",
									data: {
										mode,
										tickCount,
										eventsCreated: tickCount,
										sampledLocations,
										worldTimeBeforeISO,
										worldTimeAfterISO: state.worldTimeISO,
										stateAfter: state,
									},
								},
							});
							filesTouched.add(canonicalLogPath);
							const refreshedProjections =
								await regenerateProjectionsForEventTypes({
									bardoRoot,
									eventTypes: ["simulation_tick_applied"],
								});
							for (const projection of refreshedProjections) {
								filesTouched.add(projection.projectionPath);
							}
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
							eventsCreated: tickCount,
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
					},
				);
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
