import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { shouldTolerateAnalyzeFailure } from "./run-build-analyze-lib";

const args = (() => {
	const envArgs = process.env.NEXT_BUILD_ANALYZE_ARGS?.trim();
	if (envArgs) {
		return envArgs.split(/\s+/);
	}

	return process.argv.slice(2).length > 0
		? process.argv.slice(2)
		: ["build", "--turbopack", "--experimental-analyze"];
})();

const proc = spawn("next", args, {
	env: { ...process.env, ANALYZE: "true" },
	cwd: process.cwd(),
	stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

proc.stdout.on("data", (chunk) => {
	const text = chunk.toString();
	stdout += text;
	process.stdout.write(text);
});

proc.stderr.on("data", (chunk) => {
	const text = chunk.toString();
	stderr += text;
	process.stderr.write(text);
});

const exitCode = await new Promise<number>((resolve) => {
	proc.on("close", (code) => resolve(code ?? 1));
});

if (exitCode === 0) {
	process.exit(0);
}

const hasClientChunks = existsSync(
	join(process.cwd(), ".next", "static", "chunks"),
);
const output = `${stdout}\n${stderr}`;

if (
	shouldTolerateAnalyzeFailure({
		exitCode,
		output,
		hasClientChunks,
	})
) {
	console.warn(
		"warning: Next.js Turbopack analyze hit a known metadata-route panic after producing build artifacts. Continuing bundle audit with the generated client chunks.",
	);
	process.exit(0);
}

process.exit(exitCode);
