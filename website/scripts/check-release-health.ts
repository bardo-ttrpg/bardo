import { spawn } from "node:child_process";
import { checkReleaseHealth } from "./check-release-health-lib";

async function verifySentryAuth(args: {
	authToken: string;
	org: string;
	project: string;
}) {
	const subprocess = spawn("bunx", ["sentry-cli", "info"], {
		env: {
			...process.env,
			SENTRY_AUTH_TOKEN: args.authToken,
			SENTRY_ORG: args.org,
			SENTRY_PROJECT: args.project,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	const stdoutChunks: Buffer[] = [];
	const stderrChunks: Buffer[] = [];
	subprocess.stdout.on("data", (chunk) => {
		stdoutChunks.push(Buffer.from(chunk));
	});
	subprocess.stderr.on("data", (chunk) => {
		stderrChunks.push(Buffer.from(chunk));
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve(code ?? 1));
	});
	const stdout = Buffer.concat(stdoutChunks).toString("utf8");
	const stderr = Buffer.concat(stderrChunks).toString("utf8");

	if (exitCode !== 0) {
		throw new Error(stderr.trim() || stdout.trim() || "sentry-cli info failed");
	}
}

const result = await checkReleaseHealth(process.env, {
	verifySentryAuth,
});

if (result.skipped) {
	console.log("[release-health] skipped outside enforced release contexts");
	process.exit(0);
}

if (result.errors.length > 0) {
	console.error("[release-health] invalid release configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[release-health] warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log(
	`[release-health] passed for ${result.release ?? "unknown release"}`,
);
