import { describe, expect, test } from "vitest";
import { normalizeRuntimeManifest } from "./runtime-manifest";

describe("runtime manifest", () => {
	test("migrates missing runtime artifact fields to safe defaults", () => {
		const manifest = normalizeRuntimeManifest({
			version: 1,
			workspaceRoot: "/tmp/workspace",
			bardoRoot: "/tmp/workspace/.bardo",
			runtimeArtifacts: {
				conflictsPath: "manifests/conflicts.json",
			},
		});
		expect(manifest?.runtimeArtifacts).toMatchObject({
			conflictsPath: "manifests/conflicts.json",
			diagnosticsPath: "manifests/diagnostics.json",
			turnTracePath: "logs/turn-trace.ndjson",
			snapshotsDirectory: "snapshots",
			snapshotIndexPath: "snapshots/index.json",
		});
	});
});
