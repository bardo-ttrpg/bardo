import { describe, expect, test } from "bun:test";
import { buildConnectionSnippet } from "./connect-snippets";

describe("buildConnectionSnippet", () => {
	const baseUrl = "https://mcp.bardo.ai/mcp";
	const apiKey = "bardo_live_example";

	function render(client, mode) {
		return buildConnectionSnippet({
			client,
			mode,
			baseUrl,
			apiKey,
			serverName: "bardo",
		});
	}

	test("renders Claude remote command with BARDO_API_KEY header", () => {
		const snippet = render("claude", "remote");
		expect(snippet).toContain("claude mcp add");
		expect(snippet).toContain(baseUrl);
		expect(snippet).toContain("BARDO_API_KEY");
		expect(snippet).toContain(apiKey);
	});

	test("renders Claude local command with @bardo/mcp adapter", () => {
		const snippet = render("claude", "local");
		expect(snippet).toContain("npx -y @bardo/mcp");
		expect(snippet).toContain("--api-key");
		expect(snippet).toContain(apiKey);
	});

	test("renders Cursor remote JSON", () => {
		const snippet = render("cursor", "remote");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"url"');
		expect(snippet).toContain(baseUrl);
	});

	test("renders Codex local TOML", () => {
		const snippet = render("codex", "local");
		expect(snippet).toContain("[mcp_servers.bardo]");
		expect(snippet).toContain('command = "npx"');
		expect(snippet).toContain("@bardo/mcp");
	});
});
