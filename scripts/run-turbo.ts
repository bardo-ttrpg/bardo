import { spawn } from "node:child_process";
import { delimiter, dirname } from "node:path";

async function main() {
	const [task, ...rest] = process.argv.slice(2);
	if (!task) {
		console.error("Usage: bun run ./scripts/run-turbo.ts <task> [...args]");
		process.exit(1);
	}

	const packageManagerExecutable = process.env.npm_execpath || process.execPath;
	const packageManagerBinDir = dirname(packageManagerExecutable);
	const currentPath = process.env.PATH ?? "";
	const env = {
		...process.env,
		PATH: [packageManagerBinDir, currentPath].filter(Boolean).join(delimiter),
	};

	const subprocess = spawn("turbo", ["run", task, ...rest], {
		cwd: process.cwd(),
		env,
		stdio: "inherit",
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve(code ?? 1));
	});

	process.exit(exitCode);
}

await main();
