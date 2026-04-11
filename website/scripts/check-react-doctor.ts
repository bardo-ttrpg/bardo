import { spawn } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { normalizeNextEnvFile } from "./next-env-lib";

const EXCLUDED_NAMES = new Set([".git", ".next", "node_modules"]);

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

async function runCommandBuffered(
	command: string,
	args: string[],
	options: {
		cwd: string;
	},
) {
	const subprocess = spawn(command, args, {
		cwd: options.cwd,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdout = "";
	let stderr = "";

	subprocess.stdout.on("data", (chunk) => {
		const text = chunk.toString();
		stdout += text;
		process.stdout.write(text);
	});

	subprocess.stderr.on("data", (chunk) => {
		const text = chunk.toString();
		stderr += text;
		process.stderr.write(text);
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve(code ?? 1));
	});

	return { exitCode, stdout, stderr };
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
	await normalizeNextEnvFile(tempProjectDir);
	await runCommand("git", ["init"], {
		cwd: tempProjectDir,
		stdio: "ignore",
	});
	await runCommand("git", ["add", "-A"], {
		cwd: tempProjectDir,
		stdio: "ignore",
	});
	const reactDoctorArgs = [
		"x",
		"react-doctor@latest",
		tempProjectDir,
		"--yes",
		"--offline",
		"--fail-on",
		"warning",
	];
	const firstPass = await runCommandBuffered(
		process.execPath,
		reactDoctorArgs,
		{
			cwd: tempProjectDir,
		},
	);
	const lintWasIncomplete =
		firstPass.stdout.includes("Lint checks failed (non-fatal, skipping).") ||
		firstPass.stdout.includes("results are incomplete") ||
		firstPass.stdout.includes("Failed to parse oxlint configuration file.") ||
		firstPass.stderr.includes("Failed to parse oxlint configuration file.");

	if (firstPass.exitCode === 0 && lintWasIncomplete) {
		console.warn(
			"[react-doctor] Falling back to --no-lint because the lint phase could not complete cleanly.",
		);
		const fallbackPass = await runCommandBuffered(
			process.execPath,
			[...reactDoctorArgs, "--no-lint"],
			{
				cwd: tempProjectDir,
			},
		);
		if (fallbackPass.exitCode !== 0) {
			process.exit(fallbackPass.exitCode);
		}
	} else if (firstPass.exitCode !== 0) {
		process.exit(firstPass.exitCode);
	}
} finally {
	await rm(tempRoot, { force: true, recursive: true });
}
