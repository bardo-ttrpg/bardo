import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");

const IGNORED_FILE_SUFFIXES = [".tsbuildinfo", ".log"];

function decodeWord(codes: number[]): string {
	return String.fromCharCode(...codes);
}

const FORBIDDEN_PATTERNS = [
	{
		id: "provider-1",
		matcher: new RegExp(
			`\\b${decodeWord([99, 111, 110, 118, 101, 120])}\\b`,
			"i",
		),
	},
	{
		id: "provider-2",
		matcher: new RegExp(
			`\\b${decodeWord([114, 97, 105, 108, 119, 97, 121])}\\b`,
			"i",
		),
	},
	{
		id: "provider-3",
		matcher: new RegExp(
			`\\b${decodeWord([115, 101, 110, 116, 114, 121])}\\b`,
			"i",
		),
	},
	{
		id: "provider-4",
		matcher: new RegExp(
			`\\b${decodeWord([117, 112, 115, 116, 97, 115, 104])}\\b`,
			"i",
		),
	},
];

const IGNORED_PATHS = new Set([
	"bun.lock",
	".vscode/knip.schema.json",
	"scripts/forbidden-integrations.test.ts",
]);

async function collectTrackedFiles(): Promise<string[]> {
	const gitLsFiles = Bun.spawn(
		["git", "ls-files", "--cached", "--others", "--exclude-standard"],
		{
			cwd: repoRoot,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const exitCode = await gitLsFiles.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(gitLsFiles.stderr).text();
		throw new Error(`git ls-files failed: ${stderr}`);
	}

	const stdout = await new Response(gitLsFiles.stdout).text();
	return stdout
		.split("\n")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.filter((entry) => !IGNORED_PATHS.has(entry))
		.filter(
			(entry) =>
				!IGNORED_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix)),
		)
		.map((entry) => path.join(repoRoot, entry));
}

describe("forbidden provider references", () => {
	test("repo does not reference removed providers", async () => {
		const files = await collectTrackedFiles();
		const violations: string[] = [];

		for (const file of files) {
			let contents: string;
			try {
				contents = await readFile(file, "utf8");
			} catch (error) {
				if (
					error &&
					typeof error === "object" &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					continue;
				}
				throw error;
			}
			const relativePath = path.relative(repoRoot, file);

			for (const pattern of FORBIDDEN_PATTERNS) {
				if (pattern.matcher.test(contents)) {
					violations.push(`${pattern.id}: ${relativePath}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
