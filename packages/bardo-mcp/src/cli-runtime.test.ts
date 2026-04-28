import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJsonPath = new URL("../package.json", import.meta.url);
const modernBinPath = new URL("../bin/bardo.js", import.meta.url);
const binPath = new URL("../bin/bardo-mcp.js", import.meta.url);

type PackageJson = {
	bin?: Record<string, string>;
	engines?: Record<string, string>;
};

describe("@bardo/mcp published cli", () => {
	test("declares a Node engine and points bins to the release wrappers", () => {
		const packageJson = JSON.parse(
			readFileSync(packageJsonPath, "utf8"),
		) as PackageJson;

		expect(packageJson.bin?.bardo).toBe("bin/bardo.js");
		expect(packageJson.bin?.["bardo-mcp"]).toBe("bin/bardo-mcp.js");
		expect(packageJson.engines?.node).toBe(">=18");
	});

	test("uses Node wrappers that execute the packaged release binary", () => {
		const modernBinContents = readFileSync(modernBinPath, "utf8");
		const legacyBinContents = readFileSync(binPath, "utf8");

		expect(modernBinContents.startsWith("#!/usr/bin/env node\n")).toBe(true);
		expect(modernBinContents).toContain("dist");
		expect(modernBinContents).toContain("release");
		expect(modernBinContents).toContain("spawnSync");
		expect(legacyBinContents.startsWith("#!/usr/bin/env node\n")).toBe(true);
		expect(legacyBinContents).toContain('import "./bardo.js";');
	});
});
