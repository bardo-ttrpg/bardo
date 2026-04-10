import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceLocalDocs } from "./local-docs";

describe("ensureWorkspaceLocalDocs", () => {
	test("creates comprehensive local docs with local-first artifact guidance", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-docs-"));
		const bardoRoot = path.join(workspaceRoot, ".bardo");

		try {
			const created = await ensureWorkspaceLocalDocs({
				workspaceRoot,
				bardoRoot,
			});

			expect(created.length).toBe(11);

			const quickstart = await readFile(
				path.join(bardoRoot, "docs/quickstart.md"),
				"utf8",
			);
			const agentContract = await readFile(
				path.join(bardoRoot, "docs/agent-contract.md"),
				"utf8",
			);
			const reports = await readFile(
				path.join(bardoRoot, "docs/reports.md"),
				"utf8",
			);
			const opencode = await readFile(
				path.join(bardoRoot, "docs/clients/opencode.md"),
				"utf8",
			);
			const gemini = await readFile(
				path.join(bardoRoot, "docs/clients/gemini.md"),
				"utf8",
			);
			const cursor = await readFile(
				path.join(bardoRoot, "docs/clients/cursor.md"),
				"utf8",
			);
			const credits = await readFile(
				path.join(bardoRoot, "docs/credits-and-billing.md"),
				"utf8",
			);

			expect(quickstart).toContain("state/current-state.json");
			expect(quickstart).toContain("manifests/source-index.json");
			expect(quickstart).toContain("approve the bridge in your browser");
			expect(quickstart).toContain("user_correction");
			expect(agentContract).toContain(
				"Do not replace Bardo MCP tools with manual HTTP",
			);
			expect(reports).toContain("simulation/tracking-profile.json");
			expect(reports).toContain("events/state-changes.ndjson");
			expect(reports).not.toContain("timeline_diff");
			expect(reports).not.toContain("logs/");
			expect(opencode).toContain("opencode.json");
			expect(opencode).toContain("curl");
			expect(gemini).toContain(".gemini/settings.json");
			expect(gemini).toContain("trusted in Gemini");
			expect(cursor).toContain(".cursor/mcp.json");
			expect(cursor).toContain("manual HTTP");
			expect(credits).toContain("1 accepted MCP tool call = 1 credit");
			expect(credits).not.toContain("MCP resources");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
