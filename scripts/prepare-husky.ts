import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(import.meta.dir), ".");
const gitProbe = spawnSync("git", ["rev-parse", "--git-dir"], {
	cwd: repoRoot,
	stdio: "ignore",
});

if (gitProbe.status !== 0) {
	console.log("Skipping Husky install outside a git checkout.");
	process.exit(0);
}

const result = spawnSync("bun", ["x", "husky"], {
	cwd: repoRoot,
	stdio: "inherit",
});

if (result.error) {
	throw result.error;
}

process.exit(result.status ?? 0);
