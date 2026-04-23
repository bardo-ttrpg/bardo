import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = import.meta.dir.endsWith(`${join("scripts")}`)
	? join(import.meta.dir, "..")
	: import.meta.dir;

function readFromRepo(relativePath: string) {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("project cleanup and tooling setup", () => {
	test("keeps the active workspace graph aligned to website plus packages only", () => {
		const rootPackageJson = JSON.parse(readFromRepo("package.json")) as {
			workspaces?: string[];
			scripts?: Record<string, string>;
		};
		const knipJson = JSON.parse(readFromRepo("knip.json")) as {
			workspaces?: Record<string, unknown>;
		};
		const websiteTurboJson = JSON.parse(readFromRepo("website/turbo.json")) as {
			tasks?: Record<string, { with?: string[] }>;
		};
		const websitePackageJson = JSON.parse(
			readFromRepo("website/package.json"),
		) as {
			scripts?: Record<string, string>;
		};
		const bridgePackageJson = JSON.parse(
			readFromRepo("packages/bardo-mcp/package.json"),
		) as {
			scripts?: Record<string, string>;
		};

		expect(rootPackageJson.workspaces).toEqual(["website", "packages/*"]);
		expect(rootPackageJson.scripts?.["staging:validate-env"]).toBe(
			"bun run ./scripts/run-turbo.ts validate:staging-env --filter=website",
		);
		expect(rootPackageJson.scripts?.["ga:readiness"]).toBe(
			"bun run ./scripts/run-turbo.ts ga:readiness --filter=@bardo/engine",
		);
		expect(rootPackageJson.scripts?.["typecheck:unused-report"]).toBe(
			"bun run ./scripts/run-turbo.ts typecheck:unused-report --filter=website",
		);
		expect(rootPackageJson.scripts?.["dev:bridge"]).toBe(
			"bun run ./scripts/run-turbo.ts dev --filter=@bardo/mcp",
		);
		expect(rootPackageJson.scripts?.["stress:test-01"]).toBe(
			"bun run ./scripts/stress-bardo-test-01.ts",
		);
		expect(rootPackageJson.scripts?.["release:candidate"]).toBe(
			"bun run build && bun run test:release-gates && bun run bundle:audit && bun run stress:test-01",
		);
		expect(websitePackageJson.scripts?.["bundle:audit"]).toBe(
			"bun run ./scripts/bundle-audit.ts",
		);
		expect(websiteTurboJson.tasks?.dev?.with).toBeUndefined();
		expect(bridgePackageJson.scripts?.dev).toBe("bun --watch run src/cli.ts");
		expect(knipJson.workspaces).not.toHaveProperty("mcp");
		expect(existsSync(join(repoRoot, "mcp"))).toBe(false);
	});

	test("keeps cleanup and validation scripts scoped to the active packages", () => {
		const cleanupScript = readFromRepo("scripts/clean-artifacts.sh");
		const validateToolchainPolicy = readFromRepo(
			"scripts/validate-toolchain-policy.ts",
		);
		const turboRunner = readFromRepo("scripts/run-turbo.ts");

		expect(cleanupScript).not.toContain("$ROOT_DIR/mcp/.turbo");
		expect(cleanupScript).toContain("$ROOT_DIR/packages/bardo-mcp/.turbo");
		expect(cleanupScript).toContain(
			"$ROOT_DIR/packages/bardo-mcp/dist/release",
		);
		expect(validateToolchainPolicy).not.toContain('"website", "mcp"');
		expect(validateToolchainPolicy).not.toContain('"mcp/package-lock.json"');
		expect(validateToolchainPolicy).toContain(
			'const packageDirs = ["website"];',
		);
		expect(turboRunner).toContain('spawn("turbo", ["run", task, ...rest]');
	});

	test("keeps inspector and staging docs aligned to the bridge-first local runtime", () => {
		const inspectorDoc = readFromRepo("docs/mcp-inspector.md");
		const stagingChecklist = readFromRepo("docs/staging-smoke-checklist.md");
		const releaseChecklist = readFromRepo(
			"docs/release-candidate-checklist.md",
		);
		const recoveryRunbook = readFromRepo("docs/recovery-runbook.md");
		const stagingSmoke = readFromRepo("scripts/staging-smoke.ts");
		const stressHarness = readFromRepo("scripts/stress-bardo-test-01.ts");

		expect(inspectorDoc).toContain("Inspect the canonical client path");
		expect(inspectorDoc).not.toContain("Inspect the direct HTTP server");
		expect(inspectorDoc).not.toContain("scripts/mcp-inspector-remote.sh");
		expect(stagingChecklist).toContain(".bardo/");
		expect(stagingChecklist).toContain("release-binary flow");
		expect(stagingChecklist).toContain("bun run stress:test-01");
		expect(stagingChecklist).toContain("/api/connect/runtime-status");
		expect(stagingChecklist).not.toContain("remote-MCP-plus-local-workspace");
		expect(stagingChecklist).not.toContain("POST /mcp");
		expect(stagingChecklist).not.toContain("GET /health");
		expect(releaseChecklist).toContain("Bump");
		expect(releaseChecklist).toContain("Draft release notes");
		expect(recoveryRunbook).toContain("Bridge approval failure");
		expect(recoveryRunbook).toContain("Runtime-status outage");
		expect(stressHarness).toContain("/home/armando/projects/test-bardo-01");
		expect(stressHarness).toContain("stress-report.json");
		expect(stressHarness).toContain("Skipped oversized source");
		expect(stagingSmoke).not.toContain("world_state_overview");
		expect(stagingSmoke).not.toContain("timeline_diff");
		expect(stagingSmoke).not.toContain('name: "mcp health"');
		expect(stagingSmoke).not.toContain('readRequiredEnv("STAGING_MCP_URL")');
	});
});
