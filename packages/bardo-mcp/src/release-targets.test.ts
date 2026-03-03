import { describe, expect, test } from "bun:test";
import { RELEASE_TARGETS, resolveReleaseArtifacts } from "./release-targets";

describe("release targets", () => {
	test("defines the supported cross-platform binary targets", () => {
		expect(RELEASE_TARGETS.map((target) => target.target)).toEqual([
			"bun-linux-x64",
			"bun-linux-arm64",
			"bun-darwin-arm64",
			"bun-darwin-x64",
			"bun-windows-x64",
		]);
	});

	test("resolves deterministic artifact names for a tagged release", () => {
		expect(resolveReleaseArtifacts({ version: "0.1.0" })).toEqual([
			expect.objectContaining({
				target: "bun-linux-x64",
				outfile: "dist/release/bardo-v0.1.0-linux-x64",
			}),
			expect.objectContaining({
				target: "bun-linux-arm64",
				outfile: "dist/release/bardo-v0.1.0-linux-arm64",
			}),
			expect.objectContaining({
				target: "bun-darwin-arm64",
				outfile: "dist/release/bardo-v0.1.0-darwin-arm64",
			}),
			expect.objectContaining({
				target: "bun-darwin-x64",
				outfile: "dist/release/bardo-v0.1.0-darwin-x64",
			}),
			expect.objectContaining({
				target: "bun-windows-x64",
				outfile: "dist/release/bardo-v0.1.0-windows-x64.exe",
			}),
		]);
	});
});
