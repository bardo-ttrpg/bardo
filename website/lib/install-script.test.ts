import { describe, expect, test } from "bun:test";
import {
	renderPowerShellInstallScript,
	renderUnixInstallScript,
} from "./install-script";

describe("install scripts", () => {
	test("renders a unix installer that prefers release binaries with checksum verification", () => {
		const script = renderUnixInstallScript();

		expect(script).toContain("https://github.com/armando-andre/bardo/releases/download/");
		expect(script).toContain("SHA256SUMS.txt");
		expect(script).toContain("sha256sum");
		expect(script).toContain("BARDO_INSTALL_MODE");
		expect(script).toContain("BARDO_INSTALL_REPO");
		expect(script).toContain("bardo-v");
		expect(script).toContain("BIN_DIR");
	});

	test("renders a powershell installer that prefers release binaries with checksum verification", () => {
		const script = renderPowerShellInstallScript();

		expect(script).toContain("https://github.com/armando-andre/bardo/releases/download/");
		expect(script).toContain("SHA256SUMS.txt");
		expect(script).toContain("Get-FileHash");
		expect(script).toContain("$installMode");
		expect(script).toContain("$repoUrl");
		expect(script).toContain("bardo.cmd");
		expect(script).toContain("bardo-v");
	});

	test("keeps the Bun source install path as an explicit fallback instead of the default path", () => {
		const unixScript = renderUnixInstallScript();
		const powershellScript = renderPowerShellInstallScript();

		expect(unixScript).toContain(`INSTALL_MODE="\${BARDO_INSTALL_MODE:-binary}"`);
		expect(unixScript).toContain('if [ "$INSTALL_MODE" = "source" ]');
		expect(unixScript).toContain("install_from_source");
		expect(unixScript).toContain("bun install --frozen-lockfile");

		expect(powershellScript).toContain("$installMode");
		expect(powershellScript).toContain("$installMode -eq 'source'");
		expect(powershellScript).toContain("Install-FromSource");
		expect(powershellScript).toContain("bun install --frozen-lockfile");
	});
});
