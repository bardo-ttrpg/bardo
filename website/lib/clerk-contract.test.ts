import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WEBSITE_ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib"] as const;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const EXCLUDED_SUFFIXES = [".test.ts", ".test.tsx", ".test.js", ".test.jsx"];

function collectSourceFiles(dir: string): string[] {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectSourceFiles(fullPath));
			continue;
		}

		if (
			SOURCE_FILE_PATTERN.test(entry.name) &&
			!EXCLUDED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
		) {
			files.push(fullPath);
		}
	}

	return files;
}

function relativeWebsitePath(path: string): string {
	return path.slice(WEBSITE_ROOT.length + 1).replaceAll("\\", "/");
}

describe("Clerk integration contract", () => {
	test("keeps server identity checks on auth() and avoids currentUser() in app code", () => {
		const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
			collectSourceFiles(join(WEBSITE_ROOT, dir)),
		);

		const offenders = sourceFiles.filter((path) =>
			readFileSync(path, "utf8").includes("currentUser("),
		);

		expect(offenders.map(relativeWebsitePath)).toEqual([]);
	});

	test("uses the ClerkProvider as the central redirect contract", () => {
		const source = readFileSync(
			join(WEBSITE_ROOT, "components", "optional-clerk-provider.tsx"),
			"utf8",
		);

		expect(source).toContain("<ClerkProvider");
		expect(source).toContain("ui={clerkUi}");
		expect(source).toContain('signInUrl="/sign-in"');
		expect(source).toContain('signUpUrl="/sign-up"');
		expect(source).toContain('signInFallbackRedirectUrl="/dashboard"');
		expect(source).toContain('signUpFallbackRedirectUrl="/dashboard"');
		expect(source).toContain('afterSignOutUrl="/"');
	});

	test("uses fallback redirects on auth pages instead of force redirects", () => {
		const signInSource = readFileSync(
			join(
				WEBSITE_ROOT,
				"app",
				"(site)",
				"(auth)",
				"sign-in",
				"[[...sign-in]]",
				"page.tsx",
			),
			"utf8",
		);
		const signUpSource = readFileSync(
			join(
				WEBSITE_ROOT,
				"app",
				"(site)",
				"(auth)",
				"sign-up",
				"[[...sign-up]]",
				"page.tsx",
			),
			"utf8",
		);

		expect(signInSource).toContain('fallbackRedirectUrl="/dashboard"');
		expect(signUpSource).toContain('fallbackRedirectUrl="/dashboard"');
		expect(signInSource).not.toContain("forceRedirectUrl=");
		expect(signUpSource).not.toContain("forceRedirectUrl=");
	});

	test("keeps retained public routes free of request-time auth lookups", () => {
		const homeSource = readFileSync(
			join(WEBSITE_ROOT, "app", "(site)", "page.tsx"),
			"utf8",
		);
		const docsSource = readFileSync(
			join(WEBSITE_ROOT, "app", "(site)", "docs", "[[...slug]]", "page.tsx"),
			"utf8",
		);
		const blogSource = readFileSync(
			join(
				WEBSITE_ROOT,
				"app",
				"(site)",
				"(public-secondary)",
				"blog",
				"page.tsx",
			),
			"utf8",
		);

		expect(homeSource).not.toContain("await auth(");
		expect(homeSource).not.toContain("resolveOptionalUserId");
		expect(docsSource).not.toContain("await auth(");
		expect(blogSource).not.toContain("await auth(");
	});

	test("keeps the project-local web-design-guidelines skill available", () => {
		const skillPath = join(
			WEBSITE_ROOT,
			"..",
			".agents",
			"skills",
			"web-design-guidelines",
			"SKILL.md",
		);
		expect(statSync(skillPath).isFile()).toBe(true);
	});
});
