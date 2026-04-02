import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = dirname(dirname(fileURLToPath(import.meta.url)));
const projectRoot = dirname(websiteDir);
const artifactsDir = join(websiteDir, ".lighthouse");
const lighthouseCliPath = join(
	websiteDir,
	"node_modules",
	"lighthouse",
	"cli",
	"index.js",
);
const port = process.env.PORT ?? "3301";
const baseUrl = `http://127.0.0.1:${port}`;

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveChromePath() {
	const repoLocalBrowsersDir = join(projectRoot, ".playwright-browsers");

	if (existsSync(repoLocalBrowsersDir)) {
		const browserFolder = readdirSync(repoLocalBrowsersDir)
			.filter((entry) => entry.startsWith("chromium-"))
			.sort()
			.at(-1);

		if (browserFolder) {
			const repoLocalChrome = join(
				repoLocalBrowsersDir,
				browserFolder,
				"chrome-linux64",
				"chrome",
			);

			if (existsSync(repoLocalChrome)) {
				return repoLocalChrome;
			}
		}
	}

	const fallbackPaths = [
		"/opt/google/chrome/chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	];

	for (const candidate of fallbackPaths) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	throw new Error(
		"[lighthouse] No Chrome or Chromium executable found. Install Playwright Chromium locally or a system Chrome build first.",
	);
}

function spawnCommand(
	command: string,
	args: string[],
	options: {
		cwd: string;
		env?: NodeJS.ProcessEnv;
	},
) {
	return spawn(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

async function waitForHttp(url: string, timeoutMs: number) {
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url);
			if (response.ok) {
				return;
			}
		} catch {
			// Keep polling until the server is ready or times out.
		}

		await sleep(500);
	}

	throw new Error(`[lighthouse] Timed out waiting for ${url}`);
}

async function runBuffered(
	command: string,
	args: string[],
	options: {
		cwd: string;
		env?: NodeJS.ProcessEnv;
	},
) {
	const subprocess = spawnCommand(command, args, options);

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

	if (exitCode !== 0) {
		throw new Error(
			`[lighthouse] Command failed (${command} ${args.join(" ")}):\n${stderr || stdout}`,
		);
	}
}

if (!existsSync(join(websiteDir, ".next", "BUILD_ID"))) {
	throw new Error(
		"[lighthouse] Missing production build output. Run `bun run --cwd website build` first.",
	);
}

mkdirSync(artifactsDir, { recursive: true });

const chromePath = resolveChromePath();
const htmlReportPath = join(artifactsDir, "home.report.html");
const jsonReportPath = join(artifactsDir, "home.report.json");
const chromeProfileDir = join(artifactsDir, "chrome-profile");

if (!existsSync(lighthouseCliPath)) {
	throw new Error(
		"[lighthouse] Missing local Lighthouse CLI. Run `bun install` in the website workspace first.",
	);
}

const server = spawnCommand(process.execPath, ["run", "start"], {
	cwd: websiteDir,
	env: {
		...process.env,
		PORT: port,
	},
});

let serverLogs = "";
server.stdout.on("data", (chunk) => {
	serverLogs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
	serverLogs += chunk.toString();
});

try {
	await waitForHttp(baseUrl, 60_000);

	const sharedArgs = [
		lighthouseCliPath,
		baseUrl,
		`--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --user-data-dir=${chromeProfileDir}`,
		"--quiet",
		"--only-categories=performance,accessibility,best-practices,seo",
	];

	await runBuffered(
		"node",
		[...sharedArgs, "--output=json", `--output-path=${jsonReportPath}`],
		{
			cwd: websiteDir,
			env: {
				...process.env,
				CHROME_PATH: chromePath,
			},
		},
	);
	await runBuffered(
		"node",
		[...sharedArgs, "--output=html", `--output-path=${htmlReportPath}`],
		{
			cwd: websiteDir,
			env: {
				...process.env,
				CHROME_PATH: chromePath,
			},
		},
	);

	console.log(`[lighthouse] JSON report: ${jsonReportPath}`);
	console.log(`[lighthouse] HTML report: ${htmlReportPath}`);
} catch (error) {
	console.error(serverLogs);
	throw error;
} finally {
	server.kill("SIGTERM");
	await new Promise((resolve) => server.once("close", resolve));
}
