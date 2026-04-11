import { spawn } from "node:child_process";
import path from "node:path";
import {
	DEFAULT_WEBSITE_PORT,
	parseRequestedPort,
	readExistingWebsiteDevServer,
	resolveWebsiteDevPort,
} from "./dev-server-lib";
import { normalizeNextEnvFile } from "./next-env-lib";

const cwd = process.cwd();
const existingServer = await readExistingWebsiteDevServer(cwd);
if (existingServer) {
	console.log(
		`Website dev server is already running at ${existingServer.appUrl} (PID ${existingServer.pid}).`,
	);
	process.exit(0);
}

const requestedPort =
	parseRequestedPort(process.env.PORT) ?? DEFAULT_WEBSITE_PORT;
const selectedPort = await resolveWebsiteDevPort({
	requestedPort,
});

if (selectedPort !== requestedPort) {
	console.warn(
		`warning: Port ${requestedPort} is already in use. Starting website dev server on ${selectedPort} instead.`,
	);
}

const nextExecutable = path.join(
	cwd,
	"node_modules",
	".bin",
	process.platform === "win32" ? "next.cmd" : "next",
);
const child = spawn(
	nextExecutable,
	["dev", "--turbopack", "-p", String(selectedPort)],
	{
		cwd,
		env: {
			...process.env,
			PORT: String(selectedPort),
		},
		stdio: "inherit",
	},
);

const exitCode = await new Promise<number>((resolve, reject) => {
	child.once("error", reject);
	child.once("exit", (code, signal) => {
		if (signal) {
			resolve(1);
			return;
		}
		resolve(code ?? 0);
	});
});

await normalizeNextEnvFile(cwd);
process.exit(exitCode);
