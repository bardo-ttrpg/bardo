import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as z from "zod/v4";
import { readCanonicalEvents } from "../../domain/events/store";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { registerSceneTurnTool } from "./scene-turn";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type SceneTurnHandler = (args: {
	action: string;
	transcript?: string;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	message: string;
	gmPacket: {
		narrativeBeats: string[];
		discoveries: Array<{ kind: string; id: string; persisted: boolean }>;
	};
	actionResult: {
		locationAfter: string;
	};
	consistency: {
		success: boolean;
		errorCount: number;
	};
	groundingStatus: string;
	mustAskUser: boolean;
	inferencePolicy: string;
	commitRecommended: boolean;
	recommendedFollowUpTools: string[];
	recommendedReadTargets: string[];
	verificationChecks: Array<{
		name: string;
		status: string;
		reason: string;
	}>;
	factsFound: Array<{
		summary: string;
		source: string;
	}>;
	confidence: {
		overall: string;
		grounding: string;
	};
	recommendedNextSteps: Array<{
		action: string;
	}>;
	writePlan: {
		status: string;
		shouldWrite: boolean;
		targets: Array<{ path: string }>;
	};
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureSceneTurnHandler(args: { auth: AuthContext }): {
	handler: SceneTurnHandler;
	outputSchema: z.ZodType<unknown>;
} {
	let handler: SceneTurnHandler | null = null;
	let outputSchema: z.ZodType<unknown> | null = null;
	const server = {
		registerTool: (
			name: string,
			spec: { outputSchema?: z.ZodType<unknown> },
			callback: SceneTurnHandler,
		): void => {
			if (name === "scene_turn") {
				handler = callback;
				outputSchema = spec.outputSchema ?? null;
			}
		},
	} as unknown as McpServer;

	registerSceneTurnTool(server, args.auth);
	if (!handler || !outputSchema) {
		throw new Error("Failed to register scene_turn.");
	}
	return { handler, outputSchema };
}

describe("scene_turn tool", () => {
	test.skipIf(process.env.GITHUB_ACTIONS === "true")(
		"orchestrates player action, discovery sync, and consistency into one GM packet",
		async () => {
			const previousGuidedSetup = Bun.env.BARDO_GUIDED_SETUP_ENABLED;
			Bun.env.BARDO_GUIDED_SETUP_ENABLED = "false";
			const root = await mkdtemp(path.join(os.tmpdir(), "bardo-scene-turn-"));
			try {
				const { handler: sceneTurn, outputSchema } = captureSceneTurnHandler({
					auth: createAuth(root),
				});

				const result = await sceneTurn({
					action: "I enter the tavern and ask the barkeep their name.",
					transcript:
						'The barkeep glances up from a mug. "Name\'s Garrick," he says.',
					idempotencyKey: "scene_turn_key_12345",
				});

				expect(result.isError).toBe(false);
				expect(result.structuredContent.success).toBe(true);
				expect(() =>
					outputSchema.parse(result.structuredContent),
				).not.toThrow();
				expect(
					result.structuredContent.gmPacket.narrativeBeats.length,
				).toBeGreaterThan(0);
				expect(
					result.structuredContent.gmPacket.discoveries.some(
						(discovery) => discovery.persisted,
					),
				).toBe(true);
				expect(
					result.structuredContent.actionResult.locationAfter.length,
				).toBeGreaterThan(0);
				expect(result.structuredContent.consistency.success).toBe(true);
				expect(result.structuredContent.consistency.errorCount).toBe(0);
				expect(result.structuredContent.groundingStatus).toMatch(
					/grounded_enough|partially_grounded|underspecified/,
				);
				expect(result.structuredContent.mustAskUser).toBe(false);
				expect(result.structuredContent.inferencePolicy).toMatch(
					/safe_inference|structured_possibilities|must_ask/,
				);
				expect(result.structuredContent.commitRecommended).toBe(true);
				expect(
					result.structuredContent.recommendedFollowUpTools.length,
				).toBeGreaterThan(0);
				expect(
					result.structuredContent.recommendedReadTargets.length,
				).toBeGreaterThan(0);
				expect(result.structuredContent.verificationChecks).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							name: "continuity_contradiction_check",
						}),
						expect.objectContaining({
							name: "player_knowledge_leak_check",
						}),
						expect.objectContaining({
							name: "unsupported_inference_promotion_check",
						}),
						expect.objectContaining({
							name: "write_plan_sanity_check",
						}),
						expect.objectContaining({
							name: "setup_completeness_check",
						}),
					]),
				);
				expect(result.structuredContent.factsFound.length).toBeGreaterThan(0);
				expect(result.structuredContent.confidence.grounding).toMatch(
					/grounded_enough|partially_grounded/,
				);
				expect(
					result.structuredContent.recommendedNextSteps.length,
				).toBeGreaterThan(0);
				expect(result.structuredContent.writePlan.status).toBe(
					"already_applied",
				);
				expect(result.structuredContent.writePlan.shouldWrite).toBe(true);
				expect(
					result.structuredContent.writePlan.targets.length,
				).toBeGreaterThan(0);
			} finally {
				if (previousGuidedSetup === undefined) {
					delete Bun.env.BARDO_GUIDED_SETUP_ENABLED;
				} else {
					Bun.env.BARDO_GUIDED_SETUP_ENABLED = previousGuidedSetup;
				}
				await rm(root, { recursive: true, force: true });
			}
		},
	);

	test.skipIf(process.env.GITHUB_ACTIONS === "true")(
		"marks setup-gated turns as must-ask instead of recommending commit",
		async () => {
			const root = await mkdtemp(
				path.join(os.tmpdir(), "bardo-scene-turn-setup-"),
			);
			const { handler: sceneTurn } = captureSceneTurnHandler({
				auth: createAuth(root),
			});

			const result = await sceneTurn({
				action: "I introduce myself to the nearest villager.",
			});

			expect(result.isError).toBe(false);
			expect(result.structuredContent.mustAskUser).toBe(true);
			expect(result.structuredContent.commitRecommended).toBe(false);
			expect(result.structuredContent.groundingStatus).toMatch(
				/partially_grounded|underspecified/,
			);
			expect(result.structuredContent.verificationChecks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "setup_completeness_check",
						status: expect.stringMatching(/passed|failed/),
					}),
				]),
			);

			await rm(root, { recursive: true, force: true });
		},
	);

	test("does not mutate canon when the scene turn commit gate blocks the result", async () => {
		const previousGuidedSetup = Bun.env.BARDO_GUIDED_SETUP_ENABLED;
		Bun.env.BARDO_GUIDED_SETUP_ENABLED = "false";
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-scene-turn-no-commit-"),
		);
		const bardoRoot = resolveBardoRoot(root);

		try {
			const { handler: sceneTurn } = captureSceneTurnHandler({
				auth: createAuth(root),
			});

			const result = await sceneTurn({
				action: "I ask the barkeep their name.",
				idempotencyKey: "scene_turn_no_commit_key_12345",
			});

			expect(result.isError).toBe(false);
			expect(result.structuredContent.commitRecommended).toBe(false);
			expect(result.structuredContent.mustAskUser).toBe(true);

			const events = await readCanonicalEvents({ bardoRoot });
			expect(events).toEqual([]);
		} finally {
			if (previousGuidedSetup === undefined) {
				delete Bun.env.BARDO_GUIDED_SETUP_ENABLED;
			} else {
				Bun.env.BARDO_GUIDED_SETUP_ENABLED = previousGuidedSetup;
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
