import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiKeysTable, ConnectionSnippetPanel } from "./dashboard-client";

describe("ConnectionSnippetPanel", () => {
	test("renders the CLI login command even when no API secret is visible", () => {
		const markup = renderToStaticMarkup(
			<ConnectionSnippetPanel
				connectionClient="codex"
				onClientChange={() => undefined}
				onGenerateSnippet={() => undefined}
				onGenerateCliLoginCommand={() => undefined}
				lastSecret={null}
				lastSecretLabel={null}
				snippet=""
				snippetLoading={false}
				cliLoginCommand='bardo login --token "cli_token" --exchange-url "https://app.bardo.ai/api/connect/cli-exchange"'
				cliLoginLoading={false}
				copied={false}
				onCopy={() => undefined}
			/>,
		);

		expect(markup).toContain("bardo login --token");
		expect(markup).toContain("CLI login command");
	});

	test("renders human-friendly client labels in the selector", () => {
		const markup = renderToStaticMarkup(
			<ConnectionSnippetPanel
				connectionClient="vscode"
				onClientChange={() => undefined}
				onGenerateSnippet={() => undefined}
				onGenerateCliLoginCommand={() => undefined}
				lastSecret="bardo_live_example"
				lastSecretLabel="Example key"
				snippet=""
				snippetLoading={false}
				cliLoginCommand=""
				cliLoginLoading={false}
				copied={false}
				onCopy={() => undefined}
			/>,
		);

		expect(markup).toContain("VS Code / GitHub Copilot");
		expect(markup).toContain("Kilo Code");
		expect(markup).toContain("Kiro");
	});

	test("renders quick connect details for the selected client", () => {
		const markup = renderToStaticMarkup(
			<ConnectionSnippetPanel
				connectionClient="generic"
				onClientChange={() => undefined}
				onGenerateSnippet={() => undefined}
				onGenerateCliLoginCommand={() => undefined}
				lastSecret="bardo_live_example"
				lastSecretLabel="Example key"
				snippet=""
				snippetLoading={false}
				cliLoginCommand=""
				cliLoginLoading={false}
				copied={false}
				onCopy={() => undefined}
			/>,
		);

		expect(markup).toContain("App:");
		expect(markup).toContain("Generic MCP Client");
		expect(markup).toContain("Mode:");
		expect(markup).toContain(">local<");
		expect(markup).toContain("Config file:");
		expect(markup).toContain("app-specific");
		expect(markup).toContain("Generate CLI Login");
		expect(markup).toContain("bardo connect --client generic --mode local");
	});
});

describe("ApiKeysTable", () => {
	test("renders a load more button when more key pages are available", () => {
		const markup = renderToStaticMarkup(
			<ApiKeysTable
				keysLoading={false}
				keys={[
					{
						id: "key_1",
						name: "Primary",
						status: "active",
						scopes: ["mcp"],
						createdAt: 1,
						workspacePath: "./customers/user_1",
						callsTotal: 20,
						callsThisPeriod: 10,
						lastUsedAt: null,
						lastUsedProviderId: null,
						lastUsedModelId: null,
					},
				]}
				keysHasMore={true}
				busyId={null}
				onRotateKey={() => undefined}
				onRevokeKey={() => undefined}
				onLoadMore={() => undefined}
			/>,
		);

		expect(markup).toContain("Load more keys");
	});

	test("escapes hostile key names instead of rendering raw HTML", () => {
		const markup = renderToStaticMarkup(
			<ApiKeysTable
				keysLoading={false}
				keys={[
					{
						id: "key_1",
						name: '<script>alert("xss")</script>',
						status: "active",
						scopes: ["mcp"],
						createdAt: 1,
						workspacePath: "./customers/user_1",
						callsTotal: 20,
						callsThisPeriod: 10,
						lastUsedAt: null,
						lastUsedProviderId: null,
						lastUsedModelId: null,
					},
				]}
				keysHasMore={false}
				busyId={null}
				onRotateKey={() => undefined}
				onRevokeKey={() => undefined}
				onLoadMore={() => undefined}
			/>,
		);

		expect(markup).toContain(
			"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;",
		);
		expect(markup).not.toContain('<script>alert("xss")</script>');
	});
});
