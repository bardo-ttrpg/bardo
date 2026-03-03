import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	createWorkspaceRootManager,
	resolveWorkspaceRootFromRoots,
} from "./local-mcp";

describe("local MCP workspace roots", () => {
	test("prefers the first file root from the client roots list", () => {
		const root = resolveWorkspaceRootFromRoots([
			{ uri: "https://example.com/not-local", name: "remote" },
			{ uri: "file:///tmp/game-1", name: "game-1" },
		]);

		expect(root).toBe(fileURLToPath("file:///tmp/game-1"));
	});

	test("keeps the configured workspace when the client does not provide file roots", async () => {
		const manager = createWorkspaceRootManager({
			defaultWorkspaceRoot: "/tmp/default-workspace",
			defaultSource: "cwd",
			listRoots: async () => ({
				roots: [{ uri: "https://example.com/repo", name: "remote" }],
			}),
		});

		const context = await manager.getWorkspaceContext();

		expect(context.workspaceRoot).toBe("/tmp/default-workspace");
		expect(context.source).toBe("cwd");
	});

	test("updates the workspace root when roots/list returns a local file root", async () => {
		const manager = createWorkspaceRootManager({
			defaultWorkspaceRoot: "/tmp/default-workspace",
			defaultSource: "cwd",
			listRoots: async () => ({
				roots: [{ uri: "file:///tmp/game-42", name: "game-42" }],
			}),
		});

		const context = await manager.getWorkspaceContext();

		expect(context.workspaceRoot).toBe(fileURLToPath("file:///tmp/game-42"));
		expect(context.source).toBe("roots");
	});
});
