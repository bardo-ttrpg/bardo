import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	resolveSentryOrgSlug,
	resolveSentryRelease,
} from "../lib/sentry-server-config";

function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function runSentryCli(args: string[]): void {
	const localCli = join(process.cwd(), "node_modules", ".bin", "sentry-cli");
	const command = existsSync(localCli) ? localCli : "bunx";
	const commandArgs = existsSync(localCli)
		? args
		: ["--bun", "@sentry/cli", ...args];

	try {
		execFileSync(command, commandArgs, {
			stdio: "inherit",
			env: process.env,
		});
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"status" in error &&
			typeof error.status === "number"
		) {
			process.exit(error.status);
		}
		throw error;
	}
}

const buildDir = join(process.cwd(), ".next");
const authToken = normalize(process.env.SENTRY_AUTH_TOKEN);
const project = normalize(process.env.SENTRY_PROJECT);
const org = resolveSentryOrgSlug(process.env);
const release = resolveSentryRelease(process.env);

if (!existsSync(buildDir)) {
	console.log(`[sentry] skipping sourcemap upload: missing ${buildDir}`);
	process.exit(0);
}

if (!authToken || !project || !org || !release) {
	console.log(
		"[sentry] skipping sourcemap upload: missing auth token, org, project, or release",
	);
	process.exit(0);
}

const baseArgs = [
	"sourcemaps",
	"--auth-token",
	authToken,
	"--org",
	org,
	"--project",
	project,
	"--release",
	release,
];

console.log(`[sentry] injecting debug ids into ${buildDir}`);
runSentryCli([...baseArgs, "inject", buildDir]);

console.log(`[sentry] uploading sourcemaps from ${buildDir}`);
runSentryCli([...baseArgs, "upload", buildDir, "--wait"]);
