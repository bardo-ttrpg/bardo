import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureWorkspaceLocalDocs } from "./local-docs";

describe("ensureWorkspaceLocalDocs", () => {
	test("creates comprehensive local docs with canonical file guidance", async () => {
		const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "bardo-docs-"));
		const bardoRoot = path.join(workspaceRoot, "bardo");

		try {
			const created = await ensureWorkspaceLocalDocs({
				workspaceRoot,
				bardoRoot,
			});

			expect(created.length).toBe(7);

			const quickstart = await readFile(
				path.join(bardoRoot, "docs/quickstart.md"),
				"utf8",
			);
			const reports = await readFile(
				path.join(bardoRoot, "docs/reports.md"),
				"utf8",
			);
			const credits = await readFile(
				path.join(bardoRoot, "docs/credits-and-billing.md"),
				"utf8",
			);

			expect(quickstart).toContain("projections/current-state.md");
			expect(quickstart).toContain("events/canonical.ndjson");
			expect(quickstart).toContain("approve the bridge in your browser");
			expect(reports).toContain("logs/timeline-diff.md");
			expect(reports).toContain("timeline_diff");
			expect(reports).not.toContain("last_session_diff");
			expect(reports).not.toContain("faction-pressure");
			expect(credits).toContain("1 accepted MCP tool call = 1 credit");
			expect(credits).not.toContain("MCP resources");
		} finally {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});
});
