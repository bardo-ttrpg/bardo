import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appendCanonicalEvent } from "../../domain/events/store";
import { parseMarkdown } from "../../domain/markdown/markdown";
import type { AuthContext } from "../../types/contracts";
import { registerRegenerateProjectionTool } from "./regenerate-projection";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type RegenerateProjectionHandler = (args: {
	projectionId?: string;
	dryRun?: boolean;
}) => ToolResult<{
	success: boolean;
	projectionId: string;
	eventCount: number;
	projectionPath: string;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureRegenerateProjection(args: {
	auth: AuthContext;
}): RegenerateProjectionHandler {
	let handler: RegenerateProjectionHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: RegenerateProjectionHandler,
		): void => {
			if (name === "regenerate_projection") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerRegenerateProjectionTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register regenerate_projection.");
	}
	return handler;
}

describe("regenerate_projection tool", () => {
	test("regenerates current_state projection from canonical events", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-regenerate-proj-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await appendCanonicalEvent({
			bardoRoot,
			event: {
				id: "evt-proj-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "player_action",
				data: {
					action: "I explore the market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
					locationAfter: "river-market",
				},
			},
		});
		const regenerateProjection = captureRegenerateProjection({
			auth: createAuth(root),
		});

		const result = await regenerateProjection({
			projectionId: "current_state",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.projectionId).toBe("current_state");
		expect(result.structuredContent.eventCount).toBe(1);
		const raw = await readFile(result.structuredContent.projectionPath, "utf8");
		const parsed = parseMarkdown(raw);
		const state = JSON.parse(parsed.content) as { currentLocation: string };
		expect(state.currentLocation).toBe("river-market");

		await rm(root, { recursive: true, force: true });
	});
});
