import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectionSnippetPanel } from "./dashboard-client";

describe("ConnectionSnippetPanel", () => {
	test("renders the CLI login command even when no API secret is visible", () => {
		const markup = renderToStaticMarkup(
			<ConnectionSnippetPanel
				connectionClient="codex"
				connectionMode="local"
				onClientChange={() => undefined}
				onModeChange={() => undefined}
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
				connectionMode="local"
				onClientChange={() => undefined}
				onModeChange={() => undefined}
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

	test("renders support details for the selected client", () => {
		const markup = renderToStaticMarkup(
			<ConnectionSnippetPanel
				connectionClient="generic"
				connectionMode="remote"
				onClientChange={() => undefined}
				onModeChange={() => undefined}
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

		expect(markup).toContain("Support tier:");
		expect(markup).toContain(">generic<");
		expect(markup).toContain("Auto-install:");
		expect(markup).toContain(">no<");
		expect(markup).toContain("Config path:");
		expect(markup).toContain("manual / client-specific");
	});
});
