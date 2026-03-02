import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJsonPath = new URL("../package.json", import.meta.url);
const cliPath = new URL("./cli.ts", import.meta.url);

type PackageJson = {
	bin?: Record<string, string>;
	engines?: Record<string, string>;
};

describe("@bardo/mcp published cli", () => {
	test("declares a bun engine and points the bin to the cli entrypoint", () => {
		const packageJson = JSON.parse(
			readFileSync(packageJsonPath, "utf8"),
		) as PackageJson;

		expect(packageJson.bin?.["bardo-mcp"]).toBe("./src/cli.ts");
		expect(packageJson.engines?.bun).toBe(">=1.3.10");
	});

	test("uses a Bun shebang so package managers invoke the correct runtime", () => {
		const cliContents = readFileSync(cliPath, "utf8");

		expect(cliContents.startsWith("#!/usr/bin/env bun\n")).toBe(true);
	});
});
