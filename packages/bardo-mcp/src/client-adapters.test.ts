import { describe, expect, test } from "bun:test";
import { buildInstallConfigContent } from "./client-adapters";

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

	test("replaces codex server blocks even when the server name includes regex characters", () => {
		const serverName = "gm+[shadow](solo)";
		const output = buildInstallConfigContent({
			client: "codex",
			mode: "remote",
			serverName,
			apiKey: "bardo_live_example",
			url: "https://mcp.bardo.ai/mcp",
			existingContent: `[mcp_servers.${serverName}]
url = "https://old.example.com/mcp"
http_headers = { "Authorization" = "Bearer old-token" }
`,
		});

		expect(output).toContain(`[mcp_servers.${serverName}]`);
		expect(output).toContain('url = "https://mcp.bardo.ai/mcp"');
		expect(output).toContain('"Bearer bardo_live_example"');
		expect(output.match(/\[mcp_servers\./g)?.length).toBe(1);
	});
});
