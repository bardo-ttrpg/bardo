import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import {
	DEFAULT_WEBSITE_PORT,
	parseRequestedPort,
	readExistingWebsiteDevServer,
	resolveWebsiteDevPort,
} from "./dev-server-lib";

async function occupyPort(port: number): Promise<() => Promise<void>> {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			resolve(async () => {
				await new Promise<void>((closeResolve, closeReject) => {
					server.close((error) => {
						if (error) {
							closeReject(error);
							return;
						}
						closeResolve();
					});
				});
			});
		});
	});
}

async function createTempDir(prefix: string): Promise<string> {
	return await mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("dev-server-lib", () => {
	test("defaults to the canonical website port", () => {
		expect(DEFAULT_WEBSITE_PORT).toBe(3001);
	});

	test("parses only valid numeric ports", () => {
		expect(parseRequestedPort("3011")).toBe(3011);
		expect(parseRequestedPort(" 3011 ")).toBe(3011);
		expect(parseRequestedPort("0")).toBeNull();
		expect(parseRequestedPort("70000")).toBeNull();
		expect(parseRequestedPort("abc")).toBeNull();
		expect(parseRequestedPort("")).toBeNull();
		expect(parseRequestedPort(null)).toBeNull();
	});

	test("keeps the requested port when it is available", async () => {
		const port = await resolveWebsiteDevPort({
			requestedPort: 34811,
			searchWindow: 2,
		});
		expect(port).toBe(34811);
	});

	test("falls forward to the next available port when the requested port is busy", async () => {
		const release = await occupyPort(34821);
		try {
			const port = await resolveWebsiteDevPort({
				requestedPort: 34821,
				searchWindow: 3,
			});
			expect(port).toBe(34822);
		} finally {
			await release();
		}
	});

	test("detects an existing Next dev server lock for the current process", async () => {
		const cwd = await createTempDir("website-dev-lock-");
		try {
			await mkdir(path.join(cwd, ".next", "dev"), { recursive: true });
			await writeFile(
				path.join(cwd, ".next", "dev", "lock"),
				JSON.stringify({
					pid: process.pid,
					port: 3001,
					hostname: "localhost",
					appUrl: "http://localhost:3001",
					startedAt: Date.now(),
				}),
				"utf8",
			);

			await expect(readExistingWebsiteDevServer(cwd)).resolves.toMatchObject({
				pid: process.pid,
				appUrl: "http://localhost:3001",
			});
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	test("ignores stale Next dev server locks", async () => {
		const cwd = await createTempDir("website-dev-lock-stale-");
		try {
			await mkdir(path.join(cwd, ".next", "dev"), { recursive: true });
			await writeFile(
				path.join(cwd, ".next", "dev", "lock"),
				JSON.stringify({
					pid: 999999,
					port: 3001,
					hostname: "localhost",
					appUrl: "http://localhost:3001",
					startedAt: Date.now(),
				}),
				"utf8",
			);

			await expect(readExistingWebsiteDevServer(cwd)).resolves.toBeNull();
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
