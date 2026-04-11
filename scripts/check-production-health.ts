import { spawn } from "node:child_process";

async function runStep(label: string, args: string[]) {
	console.log(`[production-health] ${label}`);
	const subprocess = spawn(process.execPath, ["run", ...args], {
		cwd: process.cwd(),
		stdio: "inherit",
		env: process.env,
	});

	const exitCode = await new Promise<number>((resolve, reject) => {
		subprocess.once("error", reject);
		subprocess.once("close", (code) => resolve(code ?? 1));
	});

	if (exitCode !== 0) {
		process.exit(exitCode);
	}
}

await runStep("knip", ["knip"]);
await runStep("react doctor", ["check:react-doctor"]);
await runStep("vercel doctor", ["check:vercel-doctor"]);
await runStep("website build", ["--cwd", "website", "build"]);
await runStep("bundle audit", ["bundle:audit"]);
