import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

export const DEFAULT_WEBSITE_PORT = 3001;

export type ExistingDevServerLock = {
	pid: number;
	port: number;
	hostname: string;
	appUrl: string;
	startedAt: number;
};

export function parseRequestedPort(
	value: string | null | undefined,
): number | null {
	if (!value?.trim()) {
		return null;
	}

	const parsed = Number.parseInt(value.trim(), 10);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
		return null;
	}

	return parsed;
}

async function isPortAvailable(port: number, host = "127.0.0.1"): Promise<boolean> {
	return await new Promise((resolve) => {
		const server = createServer();
		server.once("error", () => resolve(false));
		server.listen(port, host, () => {
			server.close(() => resolve(true));
		});
	});
}

export async function resolveWebsiteDevPort(args?: {
	requestedPort?: number | null;
	host?: string;
	searchWindow?: number;
}): Promise<number> {
	const requestedPort = args?.requestedPort ?? DEFAULT_WEBSITE_PORT;
	const host = args?.host ?? "127.0.0.1";
	const searchWindow = args?.searchWindow ?? 20;

	if (await isPortAvailable(requestedPort, host)) {
		return requestedPort;
	}

	for (
		let candidate = requestedPort + 1;
		candidate <= requestedPort + searchWindow;
		candidate += 1
	) {
		if (await isPortAvailable(candidate, host)) {
			return candidate;
		}
	}

	throw new Error(
		`Could not find an available port between ${requestedPort} and ${
			requestedPort + searchWindow
		}.`,
	);
}

function isValidExistingDevServerLock(
	value: unknown,
): value is ExistingDevServerLock {
	const record =
		typeof value === "object" && value !== null
			? (value as Record<string, unknown>)
			: null;
	return (
		record !== null &&
		typeof record.pid === "number" &&
		typeof record.port === "number" &&
		typeof record.hostname === "string" &&
		typeof record.appUrl === "string" &&
		typeof record.startedAt === "number"
	);
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ESRCH"
		) {
			return false;
		}
		return false;
	}
}

export async function readExistingWebsiteDevServer(
	cwd: string,
): Promise<ExistingDevServerLock | null> {
	const lockPath = path.join(cwd, ".next", "dev", "lock");
	const raw = await readFile(lockPath, "utf8").catch(() => null);
	if (!raw?.trim()) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!isValidExistingDevServerLock(parsed)) {
			return null;
		}
		return isProcessAlive(parsed.pid) ? parsed : null;
	} catch {
		return null;
	}
}
