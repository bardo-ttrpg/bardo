import { describe, expect, test } from "bun:test";
import { detectInstallOs, INSTALL_COMMANDS } from "./os-detection";

describe("detectInstallOs", () => {
	test("detects windows from platform string", () => {
		expect(
			detectInstallOs({
				platform: "Win32",
				userAgent: "Mozilla/5.0",
			}),
		).toBe("windows");
	});

	test("detects macos from user agent", () => {
		expect(
			detectInstallOs({
				platform: "Unknown",
				userAgent:
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36",
			}),
		).toBe("macos");
	});

	test("detects linux from user agent", () => {
		expect(
			detectInstallOs({
				platform: "Linux x86_64",
				userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
			}),
		).toBe("linux");
	});

	test("defaults to macos when detection is unknown", () => {
		expect(
			detectInstallOs({
				platform: "Unknown",
				userAgent: "Mozilla/5.0",
			}),
		).toBe("macos");
	});
});

describe("INSTALL_COMMANDS", () => {
	test("defines commands for macos linux and windows", () => {
		expect(INSTALL_COMMANDS.macos.command).toContain("bardo.gg");
		expect(INSTALL_COMMANDS.linux.command).toContain("bardo.gg");
		expect(INSTALL_COMMANDS.windows.command).toContain("install.ps1");
	});
});
