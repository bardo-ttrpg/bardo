import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { retrieveContext } from "../../domain/context/retrieval";
import { appendCanonicalEvent } from "../../domain/events/store";
import { regenerateCurrentStateProjection } from "../../domain/projections/current-state";
import type { AuthContext } from "../../types/contracts";
import { runPlayerAction } from "../tools/player-action/register";

export type PerformanceBenchmarkResult = {
	success: boolean;
	seedEvents: number;
	sampleRuns: number;
	p95: {
		playerActionMs: number;
		projectionRefreshMs: number;
		retrievalMs: number;
	};
	indexRebuild: {
		totalCalls: number;
		rebuildCount: number;
		frequency: number;
	};
	thresholds: {
		playerActionMs: number;
		projectionRefreshMs: number;
		retrievalMs: number;
		indexRebuildFrequency: number;
	};
};

function percentile95(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(0.95 * sorted.length) - 1),
	);
	return sorted[index] ?? 0;
}

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

async function seedCampaignEvents(args: {
	bardoRoot: string;
	seedEvents: number;
}): Promise<void> {
	for (let index = 1; index <= args.seedEvents; index += 1) {
		const atISO = new Date(
			Date.UTC(2026, 1, 23, 8, 0, index % 60),
		).toISOString();
		await appendCanonicalEvent({
			bardoRoot: args.bardoRoot,
			event: {
				id: `evt-perf-seed-${String(index).padStart(4, "0")}`,
				type: "player_action_resolved",
				atISO,
				source: "perf_seed",
				data: {
					action: `seed-action-${index}`,
					intent: "general",
					worldTimeBeforeISO: atISO,
					worldTimeAfterISO: atISO,
					locationBefore: "seed-town",
					locationAfter: "seed-town",
					createdNpcIds: [],
					createdLocationIds: [],
					mechanics: {
						ruleset: "d20_v1",
						required: false,
						resolved: false,
						actionType: null,
						targetDifficulty: null,
						modifier: 0,
						advantage: null,
						rawRoll: null,
						total: null,
						outcome: null,
						margin: null,
						resolutionMode: null,
						unsupportedReason: null,
						trace: null,
						validationErrors: [],
					},
				},
			},
		});
	}
	await regenerateCurrentStateProjection({ bardoRoot: args.bardoRoot });
}

export async function runPerformanceBenchmarkEval(args?: {
	seedEvents?: number;
	sampleRuns?: number;
}): Promise<PerformanceBenchmarkResult> {
	const seedEvents = Math.max(1_000, args?.seedEvents ?? 1_000);
	const sampleRuns = Math.max(20, args?.sampleRuns ?? 30);
	const thresholds = {
		playerActionMs: 200,
		projectionRefreshMs: 80,
		retrievalMs: 80,
		indexRebuildFrequency: 0.02,
	};

	const root = await mkdtemp(path.join(os.tmpdir(), "bardo-perf-eval-"));
	const bardoRoot = path.join(root, "bardo");
	const auth = createAuth(root);
	const playerActionDurations: number[] = [];
	const projectionDurations: number[] = [];
	const retrievalDurations: number[] = [];
	let rebuildCount = 0;

	const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
	Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";

	try {
		await seedCampaignEvents({ bardoRoot, seedEvents });
		await runPlayerAction({
			auth,
			action: "I survey the market square",
			idempotencyKey: "perf_warmup_action",
			guidedSetupEnabled: false,
			nowIso: "2026-02-23T13:59:00.000Z",
		});
		await regenerateCurrentStateProjection({ bardoRoot });
		await retrieveContext({
			bardoRoot,
			query: "market",
			mode: "fast",
			focus: "all",
			limit: 8,
		});

		for (let index = 0; index < sampleRuns; index += 1) {
			const startedAt = performance.now();
			await runPlayerAction({
				auth,
				action:
					index % 4 === 0 ? "I attack the raider" : "I explore the bazaar",
				idempotencyKey: `perf_action_${String(index).padStart(3, "0")}`,
				guidedSetupEnabled: false,
				nowIso: new Date(
					Date.UTC(2026, 1, 23, 14, Math.floor(index / 60), index % 60),
				).toISOString(),
			});
			playerActionDurations.push(performance.now() - startedAt);
		}

		for (let index = 0; index < sampleRuns; index += 1) {
			const startedAt = performance.now();
			await regenerateCurrentStateProjection({ bardoRoot });
			projectionDurations.push(performance.now() - startedAt);
		}

		const retrievalCalls = 100;
		for (let index = 0; index < retrievalCalls; index += 1) {
			const startedAt = performance.now();
			const result = await retrieveContext({
				bardoRoot,
				query: index % 3 === 0 ? "attack" : "market",
				mode: "fast",
				focus: "all",
				limit: 8,
			});
			retrievalDurations.push(performance.now() - startedAt);
			if (result.indexRebuilt) {
				rebuildCount += 1;
			}
		}

		const p95 = {
			playerActionMs: percentile95(playerActionDurations),
			projectionRefreshMs: percentile95(projectionDurations),
			retrievalMs: percentile95(retrievalDurations),
		};
		const indexRebuild = {
			totalCalls: retrievalDurations.length,
			rebuildCount,
			frequency:
				retrievalDurations.length > 0
					? rebuildCount / retrievalDurations.length
					: 0,
		};

		const success =
			p95.playerActionMs <= thresholds.playerActionMs &&
			p95.projectionRefreshMs <= thresholds.projectionRefreshMs &&
			p95.retrievalMs <= thresholds.retrievalMs &&
			indexRebuild.frequency <= thresholds.indexRebuildFrequency;

		return {
			success,
			seedEvents,
			sampleRuns,
			p95,
			indexRebuild,
			thresholds,
		};
	} finally {
		if (previousStrict === undefined) {
			delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
		} else {
			Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
		}
		await rm(root, { recursive: true, force: true });
	}
}
