export type ConnectionClient =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "vscode"
	| "windsurf"
	| "generic";

export type ConnectionMode = "remote" | "local";

type BuildConnectionSnippetArgs = {
	client: ConnectionClient;
	mode: ConnectionMode;
	baseUrl: string;
	apiKey: string;
	serverName?: string;
};

const LOCAL_ADAPTER_PACKAGE = "@bardo/mcp";
const LOCAL_ADAPTER_BIN = "bardo-mcp";
const LOCAL_ADAPTER_COMMAND = "bunx";
const LOCAL_ADAPTER_PREFIX_ARGS = [
	"--bun",
	"--package",
	LOCAL_ADAPTER_PACKAGE,
	LOCAL_ADAPTER_BIN,
] as const;

function quote(value: string): string {
	return value.replaceAll('"', '\\"');
}

function buildLocalAdapterArgs(apiKey: string, baseUrl: string): string[] {
	return [...LOCAL_ADAPTER_PREFIX_ARGS, "--api-key", apiKey, "--url", baseUrl];
}

function buildLocalAdapterShellCommand(
	apiKey: string,
	baseUrl: string,
): string {
	return buildLocalAdapterCommandParts(apiKey, baseUrl).join(" ");
}

function buildLocalAdapterCommandParts(
	apiKey: string,
	baseUrl: string,
): string[] {
	return [LOCAL_ADAPTER_COMMAND, ...buildLocalAdapterArgs(apiKey, baseUrl)];
}

export function buildConnectionSnippet(
	args: BuildConnectionSnippetArgs,
): string {
	const serverName = args.serverName?.trim() || "bardo";
	const apiKey = args.apiKey;
	const baseUrl = args.baseUrl;

	if (args.mode === "remote") {
		switch (args.client) {
			case "claude":
				return `claude mcp add --scope user --transport http ${serverName} ${baseUrl} \\
--header "Authorization: Bearer ${apiKey}"`;
			case "opencode":
				return `{
  "mcp": {
    "${serverName}": {
      "type": "remote",
      "url": "${baseUrl}",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer ${apiKey}"
      },
      "enabled": true
    }
  }
}`;
			case "cursor":
			case "windsurf":
				return `{
  "mcpServers": {
    "${serverName}": {
      "url": "${baseUrl}",
      "headers": {
        "Authorization": "Bearer ${apiKey}"
      }
    }
  }
}`;
			case "codex":
				return `[mcp_servers.${serverName}]
url = "${baseUrl}"
http_headers = { "Authorization" = "Bearer ${quote(apiKey)}" }`;
			case "vscode":
				return `{
  "mcp": {
    "servers": {
      "${serverName}": {
        "type": "http",
        "url": "${baseUrl}",
        "headers": {
          "Authorization": "Bearer ${apiKey}"
        }
      }
    }
  }
}`;
			case "generic":
				return `MCP URL: ${baseUrl}
Header: Authorization: Bearer ${apiKey}`;
		}
	}

	const localArgs = buildLocalAdapterArgs(apiKey, baseUrl);
	const localCommandParts = buildLocalAdapterCommandParts(apiKey, baseUrl);
	const localCommand = buildLocalAdapterShellCommand(apiKey, baseUrl);
	switch (args.client) {
		case "claude":
			return `claude mcp add --scope user ${serverName} -- ${localCommand}`;
		case "opencode":
			return `{
  "mcp": {
    "${serverName}": {
      "type": "local",
      "command": ${JSON.stringify(localCommandParts)},
      "enabled": true
    }
  }
}`;
		case "cursor":
		case "windsurf":
			return `{
  "mcpServers": {
    "${serverName}": {
      "command": "${LOCAL_ADAPTER_COMMAND}",
      "args": ${JSON.stringify(localArgs)}
    }
  }
}`;
		case "codex":
			return `[mcp_servers.${serverName}]
command = "${LOCAL_ADAPTER_COMMAND}"
args = ${JSON.stringify(localArgs.map((value) => quote(value)))}`;
		case "vscode":
			return `{
  "mcp": {
    "servers": {
      "${serverName}": {
        "type": "stdio",
        "command": "${LOCAL_ADAPTER_COMMAND}",
        "args": ${JSON.stringify(localArgs)}
      }
    }
  }
}`;
		case "generic":
			return localCommand;
	}
}

export const SUPPORTED_CONNECTION_CLIENTS: readonly ConnectionClient[] = [
	"claude",
	"opencode",
	"cursor",
	"codex",
	"vscode",
	"windsurf",
	"generic",
] as const;
