import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const EXCLUDED_NAMES = new Set([
	".git",
	".next",
	".playwright",
	"node_modules",
]);

async function runCommand(
	command: string,
	args: string[],
	options: {
		cwd: string;
		stdio: "ignore" | "inherit";
	},
) {
	const subprocess = spawn(command, args, options);

	const exitCode = await new Promise<number>((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

const sourceDir = process.cwd();
const tempRoot = await mkdtemp(join(tmpdir(), "bardo-react-doctor-"));
const tempProjectDir = join(tempRoot, "website");

try {
	await cp(sourceDir, tempProjectDir, {
		recursive: true,
		filter(source) {
			return !EXCLUDED_NAMES.has(basename(source));
		},
	});
	await runCommand("git", ["init"], {
		cwd: tempProjectDir,
		stdio: "ignore",
	});
	await runCommand("git", ["add", "-A"], {
		cwd: tempProjectDir,
		stdio: "ignore",
	});
	await runCommand(
		"bunx",
		[
			"react-doctor@latest",
			tempProjectDir,
			"--yes",
			"--offline",
			"--fail-on",
			"warning",
		],
		{
			cwd: tempProjectDir,
			stdio: "inherit",
		},
	);
} finally {
	await rm(tempRoot, { force: true, recursive: true });
}
