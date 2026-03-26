import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as z from "zod/v4";
import type { AuthContext } from "../../types/contracts";
import { registerContextQueryTool } from "./context-query";

type ContextQueryHandler = (args: {
	query: string;
	mode?: "fast" | "deep";
	focus?: "all" | "world" | "entities" | "quests" | "state";
	limit?: number;
}) => Promise<{
	isError: boolean;
	structuredContent: {
		success: boolean;
		results: Array<{
			relativePath: string;
			title: string;
		}>;
		factsFound: Array<{
			summary: string;
			source: string;
		}>;
		confidence: {
			grounding: string;
		};
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
		coverageGaps: string[];
		recommendedNextSteps: Array<{
			action: string;
		}>;
		writePlan: {
			shouldWrite: boolean;
			status: string;
		};
	};
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureContextQueryHandler(args: { auth: AuthContext }): {
	handler: ContextQueryHandler;
	outputSchema: z.ZodType<unknown>;
} {
	let handler: ContextQueryHandler | null = null;
	let outputSchema: z.ZodType<unknown> | null = null;
	const server = {
		registerTool: (
			name: string,
			spec: { outputSchema?: z.ZodType<unknown> },
			callback: ContextQueryHandler,
		): void => {
			if (name === "context_query") {
				handler = callback;
				outputSchema = spec.outputSchema ?? null;
			}
		},
	} as unknown as McpServer;

	registerContextQueryTool(server, args.auth);
	if (!handler || !outputSchema) {
		throw new Error("Failed to register context_query.");
	}

	return { handler, outputSchema };
}

describe("context_query tool", () => {
	test("returns guidance-rich retrieval results instead of plain snippets only", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-context-query-"));
		const bardoRoot = path.join(root, "bardo");

		try {
			await mkdir(path.join(bardoRoot, "world"), { recursive: true });
			await mkdir(path.join(bardoRoot, "events"), { recursive: true });
			await Bun.write(
				path.join(bardoRoot, "world/river-market.md"),
				[
					"---",
					'title: "River Market"',
					"---",
					"",
					"The river market thrums at dusk while the dock clerk watches every barge ledger closely.",
				].join("\n"),
			);
			await writeFile(
				path.join(bardoRoot, "events/canonical.ndjson"),
				"",
				"utf8",
			);

			const { handler, outputSchema } = captureContextQueryHandler({
				auth: createAuth(root),
			});
			const result = await handler({
				query: "dock clerk river market",
				mode: "fast",
				focus: "world",
			});

			expect(result.isError).toBe(false);
			expect(result.structuredContent.success).toBe(true);
			expect(() => outputSchema.parse(result.structuredContent)).not.toThrow();
			expect(result.structuredContent.results.length).toBeGreaterThan(0);
			expect(result.structuredContent.factsFound.length).toBeGreaterThan(0);
			expect(result.structuredContent.confidence.grounding).toMatch(
				/grounded_enough|partially_grounded/,
			);
			expect(result.structuredContent.mustAskUser).toBe(false);
			expect(result.structuredContent.inferencePolicy).toBe("safe_inference");
			expect(result.structuredContent.commitRecommended).toBe(false);
			expect(result.structuredContent.recommendedFollowUpTools).toContain(
				"world_state_overview",
			);
			expect(result.structuredContent.recommendedReadTargets).toContain(
				"world/river-market.md",
			);
			expect(result.structuredContent.verificationChecks).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						name: "retrieval_evidence_strength",
					}),
				]),
			);
			expect(result.structuredContent.coverageGaps).toEqual([]);
			expect(
				result.structuredContent.recommendedNextSteps.some((step) =>
					step.action.includes("Read"),
				),
			).toBe(true);
			expect(result.structuredContent.writePlan.shouldWrite).toBe(false);
			expect(result.structuredContent.writePlan.status).toBe("none");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("marks empty retrievals as underspecified and points the agent toward clarification", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-context-query-empty-"),
		);
		const bardoRoot = path.join(root, "bardo");

		try {
			await mkdir(path.join(bardoRoot, "world"), { recursive: true });
			await writeFile(
				path.join(bardoRoot, "world/river-market.md"),
				"# River Market\n\nBarges come and go at dusk.\n",
				"utf8",
			);

			const { handler } = captureContextQueryHandler({
				auth: createAuth(root),
			});
			const result = await handler({
				query: "moon-forged crown of the vanished emperor",
				mode: "fast",
				focus: "world",
			});

			expect(result.isError).toBe(false);
			expect(result.structuredContent.results).toEqual([]);
			expect(result.structuredContent.confidence.grounding).toBe(
				"underspecified",
			);
			expect(result.structuredContent.mustAskUser).toBe(true);
			expect(result.structuredContent.inferencePolicy).toBe("must_ask");
			expect(result.structuredContent.coverageGaps.length).toBeGreaterThan(0);
			expect(result.structuredContent.recommendedFollowUpTools).toContain(
				"context_query",
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
