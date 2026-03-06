import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type * as z from "zod/v4";
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
			const root = await mkdtemp(path.join(os.tmpdir(), "bardo-scene-turn-"));
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
			expect(() => outputSchema.parse(result.structuredContent)).not.toThrow();
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

			await rm(root, { recursive: true, force: true });
		},
	);
});
