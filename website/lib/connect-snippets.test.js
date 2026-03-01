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

	test("renders Claude remote command with Authorization Bearer header", () => {
		const snippet = render("claude", "remote");
		expect(snippet).toContain("claude mcp add");
		expect(snippet).toContain(baseUrl);
		expect(snippet).toContain("Authorization: Bearer");
		expect(snippet).toContain(apiKey);
	});

	test("renders Claude local command with @bardo/mcp adapter", () => {
		const snippet = render("claude", "local");
		expect(snippet).toContain("bunx --bun --package @bardo/mcp bardo-mcp");
		expect(snippet).toContain("--api-key");
		expect(snippet).toContain(apiKey);
	});

	test("renders Cursor remote JSON", () => {
		const snippet = render("cursor", "remote");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"url"');
		expect(snippet).toContain(baseUrl);
		expect(snippet).toContain('"Authorization": "Bearer');
	});

	test("renders OpenCode remote JSON with oauth disabled", () => {
		const snippet = render("opencode", "remote");
		expect(snippet).toContain('"type": "remote"');
		expect(snippet).toContain('"oauth": false');
		expect(snippet).toContain('"Authorization": "Bearer');
	});

	test("renders OpenCode local JSON with bunx adapter command", () => {
		const snippet = render("opencode", "local");
		expect(snippet).toContain('"type": "local"');
		expect(snippet).toContain('"command": ["bunx"');
		expect(snippet).toContain('"--bun"');
		expect(snippet).toContain('"bardo-mcp"');
	});

	test("renders Codex local TOML", () => {
		const snippet = render("codex", "local");
		expect(snippet).toContain("[mcp_servers.bardo]");
		expect(snippet).toContain('command = "bunx"');
		expect(snippet).toContain("@bardo/mcp");
		expect(snippet).toContain('"--bun"');
		expect(snippet).toContain('"bardo-mcp"');
	});
});
