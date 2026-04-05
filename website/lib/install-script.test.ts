import { describe, expect, test } from "bun:test";
import {
	renderPowerShellInstallScript,
	renderUnixInstallScript,
} from "./install-script";

describe("install scripts", () => {
	test("renders a unix installer that bootstraps from the canonical repo", () => {
		const script = renderUnixInstallScript();

		expect(script).toContain("https://github.com/armando-andre/bardo.git");
		expect(script).toContain("BARDO_INSTALL_REPO");
		expect(script).toContain("bun install --frozen-lockfile");
		expect(script).toContain('BUN_BIN="$(command -v bun)"');
		expect(script).toContain("packages/bardo-mcp/src/cli.ts");
		expect(script).toContain("BIN_DIR");
	});

	test("renders a powershell installer that bootstraps from the canonical repo", () => {
		const script = renderPowerShellInstallScript();

		expect(script).toContain("https://github.com/armando-andre/bardo.git");
		expect(script).toContain("BARDO_INSTALL_REPO");
		expect(script).toContain("bun install --frozen-lockfile");
		expect(script).toContain("$bunPath = (Get-Command bun).Source");
		expect(script).toContain("bardo.cmd");
		expect(script).toContain("packages\\bardo-mcp\\src\\cli.ts");
	});
});
