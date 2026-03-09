import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["status", "--porcelain"], {
	cwd: process.cwd(),
	encoding: "utf8",
});

if (result.status !== 0) {
	console.error(result.stderr || "Failed to inspect git worktree.");
	process.exit(result.status ?? 1);
}

const output = result.stdout.trim();
if (output.length > 0) {
	console.error("Development exit requires a clean git worktree.");
	console.error(output);
	process.exit(1);
}

console.log("Git worktree is clean.");
