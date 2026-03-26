import { describe, expect, test } from "bun:test";
import { shouldTolerateAnalyzeFailure } from "./run-build-analyze-lib";

describe("shouldTolerateAnalyzeFailure", () => {
	test("does not tolerate successful builds", () => {
		expect(
			shouldTolerateAnalyzeFailure({
				exitCode: 0,
				output: "",
				hasClientChunks: true,
			}),
		).toBe(false);
	});

	test("does not tolerate generic failures", () => {
		expect(
			shouldTolerateAnalyzeFailure({
				exitCode: 1,
				output: "TypeScript compilation failed",
				hasClientChunks: true,
			}),
		).toBe(false);
	});

	test("tolerates the known Turbopack analyze panic when client chunks were still produced", () => {
		expect(
			shouldTolerateAnalyzeFailure({
				exitCode: 1,
				output:
					"thread 'tokio-runtime-worker' panicked at crates/next-api/src/analyze.rs:285:9: Module with ident not found",
				hasClientChunks: true,
			}),
		).toBe(true);
	});

	test("does not tolerate the known analyze panic when build artifacts are missing", () => {
		expect(
			shouldTolerateAnalyzeFailure({
				exitCode: 1,
				output:
					"thread 'tokio-runtime-worker' panicked at crates/next-api/src/analyze.rs:285:9: Module with ident not found",
				hasClientChunks: false,
			}),
		).toBe(false);
	});
});
