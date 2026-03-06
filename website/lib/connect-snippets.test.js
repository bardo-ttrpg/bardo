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

	test("renders Claude remote command as a local stdio shim", () => {
		const snippet = render("claude", "remote");
		expect(snippet).toContain("claude mcp add");
		expect(snippet).toContain(
			"bunx --bun --package '@bardo/mcp' 'bardo' mcp serve",
		);
		expect(snippet).toContain(`--api-key '${apiKey}'`);
		expect(snippet).toContain(`--url '${baseUrl}'`);
	});

	test("renders Claude local command with @bardo/mcp adapter", () => {
		const snippet = render("claude", "local");
		expect(snippet).toContain(
			"bunx --bun --package '@bardo/mcp' 'bardo' mcp serve",
		);
		expect(snippet).toContain(`--api-key '${apiKey}'`);
		expect(snippet).toContain('--workspace-root "$PWD"');
	});

	test("renders Cursor remote JSON as a local stdio shim", () => {
		const snippet = render("cursor", "remote");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"command": "bunx"');
		expect(snippet).toContain('"--api-key"');
		expect(snippet).toContain(baseUrl);
	});

	test("renders OpenCode remote JSON as a local stdio shim", () => {
		const snippet = render("opencode", "remote");
		expect(snippet).toContain('"type": "local"');
		expect(snippet).toContain('"command": [');
		expect(snippet).toContain('"--api-key"');
		expect(snippet).toContain(baseUrl);
	});

	test("renders OpenCode local JSON with bunx adapter command", () => {
		const snippet = render("opencode", "local");
		expect(snippet).toContain('"type": "local"');
		expect(snippet).toContain('"command": [');
		expect(snippet).toContain('"bunx"');
		expect(snippet).toContain('"--bun"');
		expect(snippet).toContain('"bardo"');
		expect(snippet).toContain('"--workspace-root"');
		expect(snippet).toContain('"."');
	});

	test("renders Kiro local JSON using the stdio adapter shape", () => {
		const snippet = render("kiro", "local");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"command": "bunx"');
		expect(snippet).toContain('"--workspace-root"');
	});

	test("renders Kilo remote JSON as a local stdio shim", () => {
		const snippet = render("kilo", "remote");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"command": "bunx"');
		expect(snippet).toContain(baseUrl);
		expect(snippet).toContain('"--api-key"');
	});

	test("renders Trae local JSON using mcpServers", () => {
		const snippet = render("trae", "local");
		expect(snippet).toContain('"mcpServers"');
		expect(snippet).toContain('"command": "bunx"');
		expect(snippet).toContain('"--workspace-root"');
	});

	test("renders Codex local TOML", () => {
		const snippet = render("codex", "local");
		expect(snippet).toContain("[mcp_servers.bardo]");
		expect(snippet).toContain('command = "bunx"');
		expect(snippet).toContain("@bardo/mcp");
		expect(snippet).toContain('"--bun"');
		expect(snippet).toContain('"bardo"');
		expect(snippet).toContain('"--workspace-root"');
	});

	test("quotes shell-sensitive Claude local command arguments", () => {
		const snippet = buildConnectionSnippet({
			client: "claude",
			mode: "local",
			baseUrl: "https://mcp.bardo.ai/mcp?name=campaign&mode=solo",
			apiKey: "token with space ' quote",
			serverName: "bardo dev",
		});

		expect(snippet).toContain("claude mcp add --scope user 'bardo dev' --");
		expect(snippet).toContain("--api-key 'token with space '\"'\"' quote'");
		expect(snippet).toContain(
			"--url 'https://mcp.bardo.ai/mcp?name=campaign&mode=solo'",
		);
	});
});
