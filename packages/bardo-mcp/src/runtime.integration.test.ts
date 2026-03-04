import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
	CallToolRequestSchema,
	ListRootsRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const cleanupPaths: string[] = [];
const cleanupServers: Array<{ stop: () => void }> = [];

async function createTempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
	cleanupPaths.push(dir);
	return dir;
}

async function makeRemoteServer() {
	let lastWorkspaceRoot: string | null = null;
	const remoteServerPort = await awaitAvailablePort();
	const remoteServer = Bun.serve({
		port: remoteServerPort,
		async fetch(request) {
			if (new URL(request.url).pathname === "/health") {
				return Response.json({ ok: true });
			}

			const server = new Server(
				{
					name: "stub-remote",
					version: "1.0.0",
				},
				{
					capabilities: {
						tools: {
							listChanged: false,
						},
					},
				},
			);
			server.setRequestHandler(ListToolsRequestSchema, async () => ({
				tools: [
					{
						name: "remote_echo_workspace",
						title: "Remote Echo Workspace",
						description:
							"Return the workspace root received by the remote server.",
						inputSchema: {
							type: "object",
							properties: {
								message: { type: "string" },
							},
							required: ["message"],
							additionalProperties: false,
						},
					},
				],
			}));
			server.setRequestHandler(CallToolRequestSchema, async (incoming) => ({
				content: [
					{
						type: "text",
						text: `remote:${String(incoming.params.arguments?.message ?? "")}`,
					},
				],
				structuredContent: {
					message: String(incoming.params.arguments?.message ?? ""),
					workspaceRoot: lastWorkspaceRoot,
				},
			}));

			lastWorkspaceRoot = request.headers.get("x-bardo-workspace-root") ?? null;
			const transport = new WebStandardStreamableHTTPServerTransport();
			await server.connect(transport);
			return transport.handleRequest(request);
		},
	});
	cleanupServers.push(remoteServer);
	return {
		url: `http://localhost:${remoteServerPort}/mcp`,
		getLastWorkspaceRoot: () => lastWorkspaceRoot,
	};
}

async function awaitAvailablePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close(() => reject(new Error("Unable to resolve a free port.")));
				return;
			}

			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

afterEach(async () => {
	for (const server of cleanupServers.splice(0)) {
		server.stop();
	}
	for (const dir of cleanupPaths.splice(0)) {
		await rm(dir, { recursive: true, force: true });
	}
});

describe("bardo mcp serve integration", () => {
	test("serves local workspace tools and proxies remote tools with roots-aware workspace binding", async () => {
		const cwdWorkspace = await createTempDir("bardo-cwd-");
		const clientWorkspace = await createTempDir("bardo-root-");
		await mkdir(path.join(clientWorkspace, "notes"), { recursive: true });
		const remote = await makeRemoteServer();
		const cliEntry = fileURLToPath(new URL("./cli.ts", import.meta.url));

		const client = new Client(
			{
				name: "integration-client",
				version: "1.0.0",
			},
			{
				capabilities: {
					roots: {
						listChanged: true,
					},
				},
			},
		);
		client.setRequestHandler(ListRootsRequestSchema, async () => ({
			roots: [{ uri: pathToFileURL(clientWorkspace).toString(), name: "game" }],
		}));

		const transport = new StdioClientTransport({
			command: "bun",
			args: [
				cliEntry,
				"mcp",
				"serve",
				"--api-key",
				"test-key",
				"--url",
				remote.url,
			],
			cwd: cwdWorkspace,
			stderr: "pipe",
		});

		try {
			await client.connect(transport);

			const tools = await client.listTools();
			expect(
				tools.tools.some((tool) => tool.name === "bardo_workspace_bootstrap"),
			).toBe(true);
			expect(
				tools.tools.some((tool) => tool.name === "remote_echo_workspace"),
			).toBe(true);

			const bootstrap = await client.callTool({
				name: "bardo_workspace_bootstrap",
				arguments: {
					ruleset: "shadowdark",
				},
			});
			expect(bootstrap.isError).toBeFalsy();

			const status = await client.callTool({
				name: "bardo_workspace_status",
				arguments: {},
			});
			expect(status.structuredContent).toMatchObject({
				workspaceRoot: clientWorkspace,
				source: "roots",
			});

			const localWrite = await client.callTool({
				name: "bardo_workspace_write_text",
				arguments: {
					path: "notes/session-1.txt",
					content: "The caravan reaches the gate.",
				},
			});
			expect(localWrite.isError).toBeFalsy();
			await expect(
				readFile(path.join(clientWorkspace, "notes/session-1.txt"), "utf8"),
			).resolves.toContain("The caravan reaches the gate.");

			const remoteEcho = await client.callTool({
				name: "remote_echo_workspace",
				arguments: {
					message: "hello",
				},
			});
			expect(remoteEcho.structuredContent).toMatchObject({
				message: "hello",
				workspaceRoot: clientWorkspace,
			});
			expect(remote.getLastWorkspaceRoot()).toBe(clientWorkspace);
		} finally {
			await client.close();
		}
	});

	test("rejects workspace symlink escapes and oversized reads", async () => {
		const cwdWorkspace = await createTempDir("bardo-cwd-");
		const clientWorkspace = await createTempDir("bardo-root-");
		const externalWorkspace = await createTempDir("bardo-external-");
		await mkdir(path.join(clientWorkspace, "notes"), { recursive: true });
		await mkdir(path.join(clientWorkspace, "links"), { recursive: true });
		await writeFile(
			path.join(clientWorkspace, "notes", "large.txt"),
			"x".repeat(10 * 1024 * 1024 + 1),
			"utf8",
		);
		await writeFile(
			path.join(externalWorkspace, "secret.txt"),
			"outside workspace",
			"utf8",
		);
		await symlink(
			path.join(externalWorkspace, "secret.txt"),
			path.join(clientWorkspace, "links", "secret.txt"),
		);

		const remote = await makeRemoteServer();
		const cliEntry = fileURLToPath(new URL("./cli.ts", import.meta.url));
		const client = new Client(
			{
				name: "integration-client",
				version: "1.0.0",
			},
			{
				capabilities: {
					roots: {
						listChanged: true,
					},
				},
			},
		);
		client.setRequestHandler(ListRootsRequestSchema, async () => ({
			roots: [{ uri: pathToFileURL(clientWorkspace).toString(), name: "game" }],
		}));

		const transport = new StdioClientTransport({
			command: "bun",
			args: [
				cliEntry,
				"mcp",
				"serve",
				"--api-key",
				"test-key",
				"--url",
				remote.url,
			],
			cwd: cwdWorkspace,
			stderr: "pipe",
		});

		try {
			await client.connect(transport);
			const status = await client.callTool({
				name: "bardo_workspace_status",
				arguments: {},
			});
			expect(status.structuredContent).toMatchObject({
				workspaceRoot: clientWorkspace,
				source: "roots",
			});

			const oversizedRead = await client.callTool({
				name: "bardo_workspace_read_text",
				arguments: {
					path: "notes/large.txt",
				},
			});
			expect(oversizedRead.isError).toBe(true);
			expect(JSON.stringify(oversizedRead.content)).toContain("too large");

			const symlinkRead = await client.callTool({
				name: "bardo_workspace_read_text",
				arguments: {
					path: "links/secret.txt",
				},
			});
			expect(symlinkRead.isError).toBe(true);
			expect(JSON.stringify(symlinkRead.content)).toContain("workspace root");
		} finally {
			await client.close();
		}
	});

	test("moves deleted paths into the workspace trash and blocks deleting the workspace root", async () => {
		const cwdWorkspace = await createTempDir("bardo-cwd-");
		const clientWorkspace = await createTempDir("bardo-root-");
		await mkdir(path.join(clientWorkspace, "notes"), { recursive: true });
		await writeFile(
			path.join(clientWorkspace, "notes", "session-2.txt"),
			"archive me",
			"utf8",
		);

		const remote = await makeRemoteServer();
		const cliEntry = fileURLToPath(new URL("./cli.ts", import.meta.url));
		const client = new Client(
			{
				name: "integration-client",
				version: "1.0.0",
			},
			{
				capabilities: {
					roots: {
						listChanged: true,
					},
				},
			},
		);
		client.setRequestHandler(ListRootsRequestSchema, async () => ({
			roots: [{ uri: pathToFileURL(clientWorkspace).toString(), name: "game" }],
		}));

		const transport = new StdioClientTransport({
			command: "bun",
			args: [
				cliEntry,
				"mcp",
				"serve",
				"--api-key",
				"test-key",
				"--url",
				remote.url,
			],
			cwd: cwdWorkspace,
			stderr: "pipe",
		});

		try {
			await client.connect(transport);
			await client.callTool({
				name: "bardo_workspace_bootstrap",
				arguments: {},
			});

			const deleted = await client.callTool({
				name: "bardo_workspace_delete_path",
				arguments: {
					path: "notes/session-2.txt",
				},
			});
			expect(deleted.isError).toBeFalsy();
			expect(deleted.structuredContent).toMatchObject({
				deleted: true,
				trashed: true,
			});
			const trashPath = (deleted.structuredContent as { trashPath?: string })
				.trashPath;
			expect(typeof trashPath).toBe("string");
			await expect(
				readFile(path.join(clientWorkspace, "notes", "session-2.txt"), "utf8"),
			).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(readFile(String(trashPath), "utf8")).resolves.toBe(
				"archive me",
			);

			const blocked = await client.callTool({
				name: "bardo_workspace_delete_path",
				arguments: {
					path: ".",
					recursive: true,
				},
			});
			expect(blocked.isError).toBe(true);
			expect(JSON.stringify(blocked.content)).toContain("workspace root");
		} finally {
			await client.close();
		}
	});
});
