import { describe, expect, test } from "bun:test";
import {
	type ToolchainPackageManifest,
	validateToolchainPolicy,
} from "./validate-toolchain-policy-lib";

function makeManifest(
	path: string,
	overrides: Partial<ToolchainPackageManifest> = {},
): ToolchainPackageManifest {
	return {
		path,
		packageManager: "bun@1.3.10",
		scripts: {},
		...overrides,
	};
}

describe("validateToolchainPolicy", () => {
	test("accepts bun-only manifests with Turbopack website scripts", () => {
		const errors = validateToolchainPolicy({
			lockfiles: [],
			packageJsons: [
				makeManifest("/repo/package.json", {
					scripts: {
						check: "bun run validate:toolchain && turbo run check",
					},
				}),
				makeManifest("/repo/website/package.json", {
					scripts: {
						dev: `next dev --turbopack -p \${PORT:-3001}`,
						build:
							"bun run validate:deploy-env && bun run check:release-health && next build --turbopack",
						"build:analyze":
							"ANALYZE=true next build --turbopack --experimental-analyze",
					},
				}),
			],
		});

		expect(errors).toEqual([]);
	});

	test("flags non-bun package managers and forbidden package-manager commands", () => {
		const errors = validateToolchainPolicy({
			lockfiles: [],
			packageJsons: [
				makeManifest("/repo/package.json", {
					packageManager: "pnpm@10.0.0",
					scripts: {
						check: "pnpm turbo run check",
						dev: "npx next dev",
					},
				}),
				makeManifest("/repo/website/package.json", {
					scripts: {
						dev: "next dev --turbopack",
						build: "next build --turbopack",
						"build:analyze":
							"ANALYZE=true next build --turbopack --experimental-analyze",
					},
				}),
			],
		});

		expect(errors).toContain(
			"/repo/package.json must declare packageManager as bun@...",
		);
		expect(errors).toContain(
			'/repo/package.json script "check" must not use npm, npx, pnpm, pnpx, or yarn.',
		);
		expect(errors).toContain(
			'/repo/package.json script "dev" must not use npm, npx, pnpm, pnpx, or yarn.',
		);
	});

	test("flags forbidden lockfiles", () => {
		const errors = validateToolchainPolicy({
			lockfiles: [
				"/repo/package-lock.json",
				"/repo/pnpm-lock.yaml",
				"/repo/yarn.lock",
			],
			packageJsons: [
				makeManifest("/repo/package.json"),
				makeManifest("/repo/website/package.json", {
					scripts: {
						dev: "next dev --turbopack",
						build: "next build --turbopack",
						"build:analyze":
							"ANALYZE=true next build --turbopack --experimental-analyze",
					},
				}),
			],
		});

		expect(errors).toContain(
			"Remove forbidden lockfile: /repo/package-lock.json",
		);
		expect(errors).toContain("Remove forbidden lockfile: /repo/pnpm-lock.yaml");
		expect(errors).toContain("Remove forbidden lockfile: /repo/yarn.lock");
	});

	test("flags website scripts that opt out of Turbopack", () => {
		const errors = validateToolchainPolicy({
			lockfiles: [],
			packageJsons: [
				makeManifest("/repo/package.json"),
				makeManifest("/repo/website/package.json", {
					scripts: {
						dev: "next dev",
						build: "next build",
						"build:analyze": "ANALYZE=true next build --webpack",
					},
				}),
			],
		});

		expect(errors).toContain(
			'/repo/website/package.json script "dev" must include --turbopack.',
		);
		expect(errors).toContain(
			'/repo/website/package.json script "build" must include --turbopack.',
		);
		expect(errors).toContain(
			'/repo/website/package.json script "build:analyze" must include --experimental-analyze for Turbopack bundle inspection.',
		);
		expect(errors).toContain(
			'/repo/website/package.json script "build:analyze" must not force webpack.',
		);
	});
});
