import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

			expect(created.length).toBe(12);

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
			const skill = await readFile(
				path.join(
					workspaceRoot,
					".agents/skills/bardo-runtime/SKILL.md",
				),
				"utf8",
			);

			expect(quickstart).toContain("state/current-state.json");
			expect(quickstart).toContain("manifests/source-index.json");
			expect(quickstart).toContain("approve the bridge in your browser");
			expect(quickstart).toContain("user_correction");
			expect(agentContract).toContain(
				"Do not replace Bardo MCP tools with manual HTTP",
			);
			expect(agentContract).toContain(
				"Do not use `world_sync` or `simulation_tick` to invent plausible new recent events",
			);
			expect(reports).toContain("simulation/tracking-profile.json");
			expect(reports).toContain("events/state-changes.ndjson");
			expect(reports).toContain("manifests/conflicts.json");
			expect(reports).toContain("manifests/diagnostics.json");
			expect(reports).toContain("logs/turn-trace.ndjson");
			expect(reports).toContain("snapshots/latest.json");
			expect(reports).toContain("snapshots/index.json");
			expect(reports).not.toContain("timeline_diff");
			expect(opencode).toContain("opencode.json");
			expect(opencode).toContain("curl");
			expect(opencode).toContain(
				"Do not use `world_sync` or `simulation_tick` to invent likely follow-on events",
			);
			expect(gemini).toContain(".gemini/settings.json");
			expect(gemini).toContain("trusted in Gemini");
			expect(cursor).toContain(".cursor/mcp.json");
			expect(cursor).toContain("manual HTTP");
			expect(credits).toContain("1 accepted MCP tool call = 1 credit");
			expect(credits).not.toContain("MCP resources");
			expect(skill).toContain("name: bardo-runtime");
			expect(skill).toContain(
				"description: Guides an MCP-capable agent",
			);
			expect(skill).toContain(".bardo/docs/quickstart.md");
			expect(skill).toContain("Read `bardo_workspace_status` before");
			expect(skill).toContain("- `scene_turn`");
			expect(skill).toContain("- `player_action`");
			expect(skill).toContain("- `world_sync`");
			expect(skill).toContain("- `simulation_tick`");
			expect(skill).toContain("- `user_correction`");
			expect(skill).toContain("If `committed` is `false`");
			expect(skill).toContain("If `eventId` and `stateHash` are present");
			expect(skill).toContain("do not teach the full internal runtime recipe");
			expect(skill).not.toContain("validator heuristics");
			expect(
				(await stat(path.join(workspaceRoot, ".agents/skills/bardo-runtime"))).isDirectory(),
			).toBe(true);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	test("rewrites the generated skill idempotently on repeated bootstrap", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-docs-"));
		const bardoRoot = path.join(workspaceRoot, ".bardo");

		try {
			await ensureWorkspaceLocalDocs({
				workspaceRoot,
				bardoRoot,
			});

			const skillPath = path.join(
				workspaceRoot,
				".agents/skills/bardo-runtime/SKILL.md",
			);
			const first = await readFile(skillPath, "utf8");

			await ensureWorkspaceLocalDocs({
				workspaceRoot,
				bardoRoot,
			});

			const second = await readFile(skillPath, "utf8");
			expect(second).toBe(first);
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
