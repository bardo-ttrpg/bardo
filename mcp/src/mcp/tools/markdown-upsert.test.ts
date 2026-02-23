import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMarkdown } from "../../domain/markdown/markdown";
import type { AuthContext } from "../../types/contracts";
import { registerMarkdownUpsertTool } from "./markdown-upsert";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type MarkdownUpsertHandler = (args: {
	path: string;
	title?: string;
	description?: string;
	content?: string;
	mergeStrategy?: "replace" | "append" | "prepend";
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

function captureHandler(args: { auth: AuthContext }): MarkdownUpsertHandler {
	let handler: MarkdownUpsertHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: MarkdownUpsertHandler,
		): void => {
			if (name === "markdown_upsert") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerMarkdownUpsertTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register markdown_upsert.");
	}
	return handler;
}

describe("markdown_upsert tool", () => {
	test("rejects writes to protected canonical namespaces", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-upsert-protect-"));
		const handler = captureHandler({ auth: createAuth(root) });

		const result = await handler({
			path: "projections/current-state.md",
			content: "tamper",
		});
		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain("protected canonical");

		await rm(root, { recursive: true, force: true });
	});

	test("allows writes to non-canonical notes", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-upsert-notes-"));
		const bardoRoot = path.join(root, "bardo");
		const handler = captureHandler({ auth: createAuth(root) });

		const result = await handler({
			path: "scratch/notes.md",
			content: "hello",
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);

		const raw = await readFile(
			path.join(bardoRoot, "scratch/notes.md"),
			"utf8",
		);
		const parsed = parseMarkdown(raw);
		expect(parsed.content).toContain("hello");

		await rm(root, { recursive: true, force: true });
	});
});
