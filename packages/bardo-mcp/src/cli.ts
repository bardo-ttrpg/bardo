#!/usr/bin/env node

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type CliOptions = {
	url: string;
	apiKey: string | null;
};

function parseArgs(argv: string[]): CliOptions {
	let url = Bun.env.BARDO_MCP_URL?.trim() || "http://127.0.0.1:3000/mcp";
	let apiKey = Bun.env.BARDO_API_KEY?.trim() || null;

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if ((arg === "--url" || arg === "-u") && typeof argv[i + 1] === "string") {
			url = argv[i + 1]!;
			i += 1;
			continue;
		}
		if (
			(arg === "--api-key" || arg === "-k") &&
			typeof argv[i + 1] === "string"
		) {
			apiKey = argv[i + 1]!;
			i += 1;
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
	}

	return { url, apiKey };
}

function printHelp(): void {
	process.stderr.write(`Bardo MCP local adapter

Usage:
  npx -y @bardo/mcp --api-key <key> [--url <mcp-url>]

Options:
  --api-key, -k   API key used as BARDO_API_KEY header
  --url, -u       Remote MCP endpoint (default: http://127.0.0.1:3000/mcp)
  --help, -h      Show this message
`);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (!options.apiKey) {
		printHelp();
		throw new Error("Missing API key. Pass --api-key or set BARDO_API_KEY.");
	}

	const stdioTransport = new StdioServerTransport();
	const remoteTransport = new StreamableHTTPClientTransport(
		new URL(options.url),
		{
			requestInit: {
				headers: {
					BARDO_API_KEY: options.apiKey,
				},
			},
		},
	);

	stdioTransport.onmessage = async (message) => {
		await remoteTransport.send(message);
	};
	remoteTransport.onmessage = async (message) => {
		await stdioTransport.send(message);
	};
	stdioTransport.onerror = (error) => {
		process.stderr.write(`stdio transport error: ${error.message}\n`);
	};
	remoteTransport.onerror = (error) => {
		process.stderr.write(`remote transport error: ${error.message}\n`);
	};

	let closed = false;
	const closeAll = async () => {
		if (closed) return;
		closed = true;
		await Promise.allSettled([stdioTransport.close(), remoteTransport.close()]);
	};

	stdioTransport.onclose = () => {
		void closeAll();
	};
	remoteTransport.onclose = () => {
		void closeAll();
	};

	process.on("SIGINT", () => {
		void closeAll().finally(() => process.exit(0));
	});
	process.on("SIGTERM", () => {
		void closeAll().finally(() => process.exit(0));
	});

	await remoteTransport.start();
	await stdioTransport.start();
}

void main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`${message}\n`);
	process.exit(1);
});
