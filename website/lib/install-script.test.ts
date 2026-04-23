import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	BARDO_MCP_PACKAGE_VERSION,
	BARDO_MCP_PUBLIC_RELEASES_BASE_URL,
	BARDO_MCP_RELEASE_VERSION,
} from "./bardo-mcp-release";
import {
	renderPowerShellInstallScript,
	renderUnixInstallScript,
} from "./install-script";

type PackageJson = {
	version?: string;
};

describe("install scripts", () => {
	test("keeps the bundled MCP release version synced with the package manifest", () => {
		const raw = readFileSync(
			new URL("../../packages/bardo-mcp/package.json", import.meta.url),
			"utf8",
		);
		const parsed = JSON.parse(raw) as PackageJson;

		expect(BARDO_MCP_PACKAGE_VERSION).toBe(parsed.version);
	});

	test("renders a unix installer that prefers release binaries with checksum verification", () => {
		const script = renderUnixInstallScript();

		expect(script).toContain(
			`${BARDO_MCP_PUBLIC_RELEASES_BASE_URL}/${BARDO_MCP_RELEASE_VERSION}`,
		);
		expect(script).toContain("SHA256SUMS.txt");
		expect(script).toContain("sha256sum");
		expect(script).toContain("BARDO_INSTALL_MODE");
		expect(script).toContain("BARDO_INSTALL_REPO");
		expect(script).toContain("bardo-v");
		expect(script).toContain("BIN_DIR");
	});

	test("renders a powershell installer that prefers release binaries with checksum verification", () => {
		const script = renderPowerShellInstallScript();

		expect(script).toContain(
			`${BARDO_MCP_PUBLIC_RELEASES_BASE_URL}/${BARDO_MCP_RELEASE_VERSION}`,
		);
		expect(script).toContain("SHA256SUMS.txt");
		expect(script).toContain("Get-FileHash");
		expect(script).toContain("$installMode");
		expect(script).toContain("$repoUrl");
		expect(script).toContain("bardo.cmd");
		expect(script).toContain("bardo-v");
		expect(script).toContain("Add-BardoBinToPath $binDir");
		expect(script).toContain("[Environment]::SetEnvironmentVariable");
		expect(script).toContain("current PowerShell session");
	});

	test("keeps the Bun source install path as an explicit fallback instead of the default path", () => {
		const unixScript = renderUnixInstallScript();
		const powershellScript = renderPowerShellInstallScript();

		expect(unixScript).toContain(
			`INSTALL_MODE="\${BARDO_INSTALL_MODE:-binary}"`,
		);
		expect(unixScript).toContain('if [ "$INSTALL_MODE" = "source" ]');
		expect(unixScript).toContain("install_from_source");
		expect(unixScript).toContain("bun install --frozen-lockfile");

		expect(powershellScript).toContain("$installMode");
		expect(powershellScript).toContain("$installMode -eq 'source'");
		expect(powershellScript).toContain("Install-FromSource");
		expect(powershellScript).toContain("bun install --frozen-lockfile");
	});
});
