import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMarkdown } from "../../domain/markdown/markdown";
import type { AuthContext } from "../../types/contracts";
import { registerStateSetTool } from "./state-set";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type StateSetHandler = (args: {
	path?: string;
	state: Record<string, unknown>;
	title?: string;
	description?: string;
}) => ToolResult<{
	success: boolean;
	message: string;
	filePath: string;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureStateSetHandler(args: { auth: AuthContext }): StateSetHandler {
	let handler: StateSetHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: StateSetHandler,
		): void => {
			if (name === "state_set") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerStateSetTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register state_set.");
	}
	return handler;
}

describe("state_set tool", () => {
	test("rejects writes to protected canonical paths", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-set-protect-"),
		);
		const handler = captureStateSetHandler({ auth: createAuth(root) });

		const result = await handler({
			path: "state/current.md",
			state: { currentLocation: "town" },
		});
		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain("protected canonical");

		await rm(root, { recursive: true, force: true });
	});

	test("allows writes to non-canonical scratch paths", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-set-scratch-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const handler = captureStateSetHandler({ auth: createAuth(root) });

		const result = await handler({
			path: "scratch/state-note.md",
			state: { note: "temporary" },
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);

		const raw = await readFile(
			path.join(bardoRoot, "scratch/state-note.md"),
			"utf8",
		);
		const parsed = parseMarkdown(raw);
		expect(parsed.frontmatter.title).toBeDefined();

		await rm(root, { recursive: true, force: true });
	});
});
