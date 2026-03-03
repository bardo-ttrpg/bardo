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
	test("declares a bun engine and points the bin to a Bun wrapper", () => {
		const packageJson = JSON.parse(
			readFileSync(packageJsonPath, "utf8"),
		) as PackageJson;

		expect(packageJson.bin?.bardo).toBe("./bin/bardo.js");
		expect(packageJson.bin?.["bardo-mcp"]).toBe("./bin/bardo-mcp.js");
		expect(packageJson.engines?.bun).toBe(">=1.3.10");
	});

	test("uses Bun shebang wrappers instead of exposing raw TypeScript as the bins", () => {
		const modernBinContents = readFileSync(modernBinPath, "utf8");
		const legacyBinContents = readFileSync(binPath, "utf8");

		expect(modernBinContents.startsWith("#!/usr/bin/env bun\n")).toBe(true);
		expect(modernBinContents).toContain('import "../src/cli.ts";');
		expect(legacyBinContents.startsWith("#!/usr/bin/env bun\n")).toBe(true);
		expect(legacyBinContents).toContain('import "../src/cli.ts";');
	});
});
