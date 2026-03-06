import { describe, expect, test } from "bun:test";
import {
	buildConnectionSnippet,
	buildInstallConfigContent,
} from "./client-adapters";

describe("client adapters", () => {
	test("reports an actionable error for malformed existing JSON config", () => {
		expect(() =>
			buildInstallConfigContent({
				client: "kiro",
				mode: "local",
				serverName: "bardo",
				apiKey: "bardo_live_example",
				url: "https://mcp.bardo.ai/mcp",
				existingContent: "{invalid-json",
			}),
		).toThrow(
			"Existing config is not valid JSON. Fix or delete it before running install.",
		);
	});

	test("remote codex installs are shimmed to local stdio blocks", () => {
		const serverName = "gm+[shadow](solo)";
		const output = buildInstallConfigContent({
			client: "codex",
			mode: "remote",
			serverName,
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: `[mcp_servers."${serverName}"]
url = "https://old.example.com/mcp"
http_headers = { "Authorization" = "Bearer old-token" }
`,
		});

		expect(output).toContain(`[mcp_servers."${serverName}"]`);
		expect(output).toContain('command = "bunx"');
		expect(output).toContain("--workspace-root");
		expect(output.match(/\[mcp_servers\./g)?.length).toBe(1);
		expect(output).not.toContain("https://old.example.com/mcp");
		expect(output).not.toContain("old-token");
	});

	test("replaces codex server blocks even when a blank line follows the table header", () => {
		const output = buildInstallConfigContent({
			client: "codex",
			mode: "remote",
			serverName: "bardo",
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: `[mcp_servers.bardo]

url = "https://old.example.com/mcp"
http_headers = { "Authorization" = "Bearer old-token" }
`,
		});

		expect(output).toContain("[mcp_servers.bardo]");
		expect(output).toContain('command = "bunx"');
		expect(output).toContain("--workspace-root");
		expect(output).not.toContain("https://old.example.com/mcp");
		expect(output).not.toContain("old-token");
	});

	test("replaces codex server blocks even when the header has a trailing comment", () => {
		const output = buildInstallConfigContent({
			client: "codex",
			mode: "remote",
			serverName: "bardo",
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: `[mcp_servers.bardo] # existing bardo server
url = "https://old.example.com/mcp"
http_headers = { "Authorization" = "Bearer old-token" }
`,
		});

		expect(output).toContain("[mcp_servers.bardo]");
		expect(output).toContain('command = "bunx"');
		expect(output).not.toContain("https://old.example.com/mcp");
		expect(output).not.toContain("old-token");
		expect(output.match(/\[mcp_servers\.bardo\]/g)?.length).toBe(1);
	});

	test("mcpServers remote installs are shimmed to local stdio transport", () => {
		const output = buildInstallConfigContent({
			client: "claude",
			mode: "remote",
			serverName: "bardo",
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: "",
		});
		const config = JSON.parse(output);
		expect(config.mcpServers.bardo.command).toBe("bunx");
		expect(Array.isArray(config.mcpServers.bardo.args)).toBe(true);
	});

	test("codex local snippet uses the same escaping as the install path", () => {
		const apiKey = 'bardo_live_"quoted"';
		const url = "https://mcp.bardo.ai/mcp";
		const snippet = buildConnectionSnippet({
			client: "codex",
			mode: "local",
			baseUrl: url,
			apiKey,
			serverName: "bardo",
		});
		const installed = buildInstallConfigContent({
			client: "codex",
			mode: "local",
			serverName: "bardo",
			apiKey,
			url,
			existingContent: "",
		}).trim();

		expect(snippet).toBe(installed);
	});

	test("quotes Codex server names that would otherwise break TOML table headers", () => {
		const serverName = "gm]\n[injected";
		const output = buildInstallConfigContent({
			client: "codex",
			mode: "remote",
			serverName,
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: "",
		});

		expect(output).toContain('[mcp_servers."gm]\\n[injected"]');
		expect(output).not.toContain("[injected]");
		expect(output).toContain('command = "bunx"');
	});
});
