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
});
