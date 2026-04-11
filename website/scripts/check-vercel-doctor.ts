import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { normalizeNextEnvFile } from "./next-env-lib";

const EXCLUDED_NAMES = new Set([".git", ".next", "node_modules"]);
const ALLOWLISTED_WARNING_RULES = new Set([
	"nextjs-link-prefetch-default",
	"vercel-consider-fluid-compute",
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

function extractDiagnosticsPath(output: string): string | null {
	const match = output.match(/Full diagnostics written to (.+)$/m);
	return match?.[1]?.trim() ?? null;
}

type Diagnostic = {
	rule?: string;
	message?: string;
};

async function main() {
	const sourceDir = process.cwd();
	const tempRoot = await mkdtemp(join(tmpdir(), "bardo-vercel-doctor-"));
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

		const result = await runCommandBuffered(
			process.execPath,
			["x", "vercel-doctor@latest", tempProjectDir, "--yes", "--offline"],
			{
				cwd: tempProjectDir,
			},
		);

		if (result.exitCode !== 0) {
			process.exit(result.exitCode);
		}

		const diagnosticsPath = extractDiagnosticsPath(
			`${result.stdout}\n${result.stderr}`,
		);
		if (!diagnosticsPath) {
			return;
		}

		let diagnostics: Diagnostic[] = [];
		try {
			const diagnosticsRaw = await readFile(diagnosticsPath, "utf8");
			diagnostics = JSON.parse(diagnosticsRaw) as Diagnostic[];
		} catch {
			diagnostics = [];
		}

		const blockingDiagnostics = diagnostics.filter(
			(diagnostic) => !ALLOWLISTED_WARNING_RULES.has(diagnostic.rule ?? ""),
		);

		if (blockingDiagnostics.length > 0) {
			console.error("[vercel-doctor] blocking diagnostics:");
			for (const diagnostic of blockingDiagnostics) {
				console.error(
					`- ${diagnostic.rule ?? "unknown"}: ${diagnostic.message ?? "No message"}`,
				);
			}
			process.exit(1);
		}

		if (diagnostics.length > 0) {
			console.warn(
				"[vercel-doctor] allowed warnings remain from Vercel Doctor heuristics: nextjs-link-prefetch-default, vercel-consider-fluid-compute.",
			);
		}
	} finally {
		await rm(tempRoot, { force: true, recursive: true });
	}
}

await main();
