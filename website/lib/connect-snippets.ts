export type ConnectionClient =
	| "claude"
	| "opencode"
	| "cursor"
	| "codex"
	| "vscode"
	| "windsurf"
	| "generic";

export type ConnectionMode = "remote" | "local";

export type BuildConnectionSnippetArgs = {
	client: ConnectionClient;
	mode: ConnectionMode;
	baseUrl: string;
	apiKey: string;
	serverName?: string;
};

function quote(value: string): string {
	return value.replaceAll('"', '\\"');
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

	const localCommand = `npx -y @bardo/mcp --api-key ${apiKey} --url ${baseUrl}`;
	switch (args.client) {
		case "claude":
			return `claude mcp add --scope user ${serverName} -- npx -y @bardo/mcp --api-key ${apiKey} --url ${baseUrl}`;
		case "opencode":
			return `{
  "mcp": {
    "${serverName}": {
      "type": "local",
      "command": ["npx", "-y", "@bardo/mcp", "--api-key", "${apiKey}", "--url", "${baseUrl}"],
      "enabled": true
    }
  }
}`;
		case "cursor":
		case "windsurf":
			return `{
  "mcpServers": {
    "${serverName}": {
      "command": "npx",
      "args": ["-y", "@bardo/mcp", "--api-key", "${apiKey}", "--url", "${baseUrl}"]
    }
  }
}`;
		case "codex":
			return `[mcp_servers.${serverName}]
command = "npx"
args = ["-y", "@bardo/mcp", "--api-key", "${quote(apiKey)}", "--url", "${baseUrl}"]`;
		case "vscode":
			return `{
  "mcp": {
    "servers": {
      "${serverName}": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@bardo/mcp", "--api-key", "${apiKey}", "--url", "${baseUrl}"]
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
