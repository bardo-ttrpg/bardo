import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = import.meta.dir.endsWith(`${join("scripts")}`)
	? join(import.meta.dir, "..")
	: import.meta.dir;

function readFromRepo(relativePath: string) {
	return readFileSync(join(repoRoot, relativePath), "utf8");
}

function joinTokens(parts: readonly string[], separator = "") {
	return parts.join(separator);
}

function listSkillFiles(skillsRoot: string): string[] {
	return readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(skillsRoot, entry.name, "SKILL.md"))
		.filter((skillPath) => existsSync(skillPath));
}

describe("project cleanup and tooling setup", () => {
	test("removes the obsolete Clerk webhook route and related website env secrets", () => {
		expect(
			existsSync(join(repoRoot, "website/app/api/webhooks/clerk/route.ts")),
		).toBe(false);
		expect(
			existsSync(
				join(repoRoot, "website/app/api/webhooks/clerk/route.test.ts"),
			),
		).toBe(false);

		const websiteEnvExample = readFromRepo("website/.env.example");
		const websiteEnvLocal = readFromRepo("website/.env.local");
		const webhookSecret = joinTokens(
			["CLERK", "WEBHOOK", "SIGNING", "SECRET"],
			"_",
		);
		const controlPlaneSecret = joinTokens(
			["BARDO", "CONTROL", "PLANE", "SYNC", "SECRET"],
			"_",
		);

		for (const envFile of [websiteEnvExample, websiteEnvLocal]) {
			expect(envFile).not.toContain(webhookSecret);
			expect(envFile).not.toContain(controlPlaneSecret);
		}
	});

	test("keeps Bun, Biome, and Turbo configured with package-level tasks", () => {
		const packageJson = JSON.parse(readFromRepo("package.json")) as {
			packageManager?: string;
			devDependencies?: Record<string, string>;
			dependencies?: Record<string, string>;
			scripts?: Record<string, string>;
		};
		const websitePackageJson = JSON.parse(
			readFromRepo("website/package.json"),
		) as {
			scripts?: Record<string, string>;
		};
		const mcpPackageJson = JSON.parse(readFromRepo("mcp/package.json")) as {
			scripts?: Record<string, string>;
		};
		const packageMcpPackageJson = JSON.parse(
			readFromRepo("packages/bardo-mcp/package.json"),
		) as {
			scripts?: Record<string, string>;
		};
		const turboJson = JSON.parse(readFromRepo("turbo.json")) as {
			globalDependencies?: string[];
			tasks?: Record<string, unknown>;
		};
		const websiteTurboJson = JSON.parse(readFromRepo("website/turbo.json")) as {
			extends?: string[];
			tasks?: Record<string, { outputs?: string[] }>;
		};
		const mcpTurboJson = JSON.parse(readFromRepo("mcp/turbo.json")) as {
			extends?: string[];
			tasks?: Record<string, unknown>;
		};
		const packageMcpTurboJson = JSON.parse(
			readFromRepo("packages/bardo-mcp/turbo.json"),
		) as {
			extends?: string[];
			tasks?: Record<string, { outputs?: string[] }>;
		};
		const biomeJson = JSON.parse(readFromRepo("biome.json")) as {
			$schema?: string;
			vcs?: {
				defaultBranch?: string;
			};
		};
		const bunfigToml = readFromRepo("bunfig.toml");

		expect(packageJson.packageManager).toBe("bun@1.3.10");
		expect(packageJson.scripts?.dev).toBe("turbo run dev --filter=website");
		expect(packageJson.scripts?.["dev:all"]).toBe("turbo run dev");
		expect(packageJson.scripts?.format).toBe("turbo run format");
		expect(packageJson.scripts).not.toHaveProperty("test:e2e");
		expect(packageJson.scripts).not.toHaveProperty("test:e2e:auth");
		expect(packageJson.scripts).not.toHaveProperty("test:e2e:headed");
		expect(packageJson.scripts).not.toHaveProperty("test:e2e:auth:headed");
		expect(packageJson.scripts?.["test:runtime-smoke"]).toBe(
			"turbo run test:runtime-smoke --filter=@bardo/mcp",
		);
		expect(packageJson.scripts?.["staging:validate-env"]).toBe(
			"turbo run validate:staging-env --filter=website --filter=mcp",
		);
		expect(packageJson.scripts?.["ga:readiness"]).toBe(
			"turbo run ga:readiness --filter=mcp",
		);
		expect(packageJson.scripts?.["check:release-health"]).toBe(
			"turbo run check:release-health --filter=website",
		);
		expect(packageJson.scripts?.["check:react-doctor"]).toBe(
			"turbo run check:react-doctor --filter=website",
		);
		expect(packageJson.scripts?.["bundle:audit"]).toBe(
			"turbo run bundle:audit --filter=website",
		);
		expect(packageJson.scripts?.["typecheck:unused-report"]).toBe(
			"turbo run typecheck:unused-report --filter=website --filter=mcp",
		);
		expect(packageJson.scripts?.["biome:lint"]).toBe("biome lint .");
		expect(packageJson.scripts?.["biome:format"]).toBe(
			"biome format --write .",
		);
		expect(packageJson.scripts?.["biome:check"]).toBe("biome check .");
		expect(packageJson.scripts?.["biome:ci"]).toBe("biome ci .");
		expect(packageJson.scripts?.["check:staged"]).toBe(
			"biome check --write --staged --files-ignore-unknown=true --no-errors-on-unmatched",
		);
		expect(packageJson.devDependencies).not.toHaveProperty("lint-staged");
		expect(packageJson.dependencies).toBeUndefined();

		for (const scriptCommand of Object.values(packageJson.scripts ?? {})) {
			expect(scriptCommand).not.toContain("--cwd");
			expect(scriptCommand).not.toContain("cd website &&");
			expect(scriptCommand).not.toContain("cd mcp &&");
			expect(scriptCommand).not.toContain("cd packages/");
		}

		expect(websitePackageJson.scripts?.lint).toBe("biome lint .");
		expect(websitePackageJson.scripts?.format).toBe("biome format --write .");
		expect(websitePackageJson.scripts).not.toHaveProperty("dev:e2e");
		expect(websitePackageJson.scripts).not.toHaveProperty(
			"validate:e2e-auth-env",
		);
		expect(websitePackageJson.scripts).not.toHaveProperty("test:e2e");
		expect(websitePackageJson.scripts).not.toHaveProperty("test:e2e:auth");
		expect(websitePackageJson.scripts?.["typecheck:unused-report"]).toBe(
			"tsc --noEmit -p tsconfig.unused.json",
		);
		expect(mcpPackageJson.scripts?.lint).toBe("biome lint .");
		expect(mcpPackageJson.scripts?.format).toBe("biome format --write .");
		expect(mcpPackageJson.scripts?.["typecheck:unused-report"]).toBe(
			"tsc --noEmit -p tsconfig.unused.json",
		);
		expect(packageMcpPackageJson.scripts?.build).toBe(
			`"\${npm_execpath:-bun}" run build:release`,
		);
		expect(packageMcpPackageJson.scripts?.typecheck).toBe("tsc --noEmit");
		expect(packageMcpPackageJson.scripts?.check).toBe(
			`"\${npm_execpath:-bun}" run lint && "\${npm_execpath:-bun}" run typecheck`,
		);

		expect(turboJson.tasks).toHaveProperty("format");
		expect(turboJson.tasks).toHaveProperty("validate:staging-env");
		expect(turboJson.tasks).toHaveProperty("typecheck:unused-report");
		expect(turboJson.tasks).not.toHaveProperty("test:e2e");
		expect(turboJson.tasks).not.toHaveProperty("test:e2e:auth");
		expect(turboJson.tasks).not.toHaveProperty("test:e2e:headed");
		expect(turboJson.tasks).not.toHaveProperty("test:e2e:auth:headed");
		expect(turboJson.tasks).not.toHaveProperty("validate:e2e-auth-env");
		expect(turboJson.tasks).toHaveProperty("test:runtime-smoke");
		expect(turboJson.tasks).toHaveProperty("ga:readiness");
		expect(turboJson.tasks).not.toHaveProperty("website#build");
		expect(turboJson.tasks).not.toHaveProperty("mcp#build");
		expect(turboJson.globalDependencies).not.toContain(".env*");
		expect(turboJson.globalDependencies).not.toContain("website/.env*");
		expect(turboJson.globalDependencies).not.toContain("mcp/.env*");
		expect(websiteTurboJson.extends).toEqual(["//"]);
		expect(websiteTurboJson.tasks?.dev).toEqual({
			with: ["mcp#dev"],
			cache: false,
			persistent: true,
			interruptible: true,
		});
		expect(websiteTurboJson.tasks?.build?.outputs).toEqual([
			"$TURBO_EXTENDS$",
			".next/**",
			"!.next/cache/**",
		]);
		expect(mcpTurboJson.extends).toEqual(["//"]);
		expect(packageMcpTurboJson.extends).toEqual(["//"]);
		expect(packageMcpTurboJson.tasks?.build?.outputs).toEqual([
			"$TURBO_EXTENDS$",
			"dist/**",
		]);
		expect(biomeJson.$schema).toBe(
			"https://biomejs.dev/schemas/2.4.6/schema.json",
		);
		expect(biomeJson.vcs?.defaultBranch).toBe("main");
		expect(bunfigToml).toContain("linkWorkspacePackages = true");
	});

	test("installs the local Turborepo skill guidance", () => {
		const skillPath = join(repoRoot, ".agents/skills/turborepo/SKILL.md");
		expect(existsSync(skillPath)).toBe(true);

		const skill = readFileSync(skillPath, "utf8");
		expect(skill).toContain("Turborepo Skill");
		expect(skill).toContain("IMPORTANT: Package Tasks, Not Root Tasks");
	});

	test("removes Clerk frontend API env dependencies from the repo contract", () => {
		expect(existsSync(join(repoRoot, ".env.local"))).toBe(false);

		const websiteEnvExample = readFromRepo("website/.env.example");
		const websiteEnvLocal = readFromRepo("website/.env.local");
		const websiteStagingEnvValidator = readFromRepo(
			"website/scripts/validate-staging-env-lib.ts",
		);
		const websiteStagingEnvValidatorTest = readFromRepo(
			"website/scripts/validate-staging-env-lib.test.ts",
		);
		const mcpEnv = readFromRepo("mcp/.env");
		const frontendApi = joinTokens(["CLERK", "FRONTEND", "API", "URL"], "_");

		for (const fileSource of [
			websiteEnvExample,
			websiteEnvLocal,
			websiteStagingEnvValidator,
			websiteStagingEnvValidatorTest,
			mcpEnv,
		]) {
			expect(fileSource).not.toContain(frontendApi);
		}
	});

	test("keeps only the minimal blog surface", () => {
		const blogSegment = joinTokens(["", "blog"], "/");
		expect(
			existsSync(
				join(
					repoRoot,
					joinTokens(["website", "content", "blog", "posts.ts"], "/"),
				),
			),
		).toBe(false);
		expect(
			existsSync(
				join(
					repoRoot,
					joinTokens(
						["website", "app", "(site)", "(public-secondary)", "blog"],
						"/",
					),
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(repoRoot, joinTokens(["website", "public", "blog"], "/")),
			),
		).toBe(false);

		const landingPageSource = readFromRepo("website/app/(site)/page.tsx");
		const blogPageSource = readFromRepo(
			"website/app/(site)/(public-secondary)/blog/page.tsx",
		);
		const robotsSource = readFromRepo("website/app/robots.ts");
		const sitemapSource = readFromRepo("website/app/sitemap.ts");
		const seoTestSource = readFromRepo("website/app/seo.test.ts");
		const stagingSmokeSource = readFromRepo("scripts/staging-smoke.ts");

		for (const fileSource of [
			landingPageSource,
			blogPageSource,
			robotsSource,
			sitemapSource,
			seoTestSource,
			stagingSmokeSource,
		]) {
			expect(fileSource).toContain(blogSegment);
		}
	});

	test("keeps local skill frontmatter aligned with current Codex conventions", () => {
		const supportedKey = joinTokens(["allowed", "tools:"], "-");
		const unsupportedKey = "allowed_tools:";
		const shadcnSkill = readFileSync(
			join(repoRoot, ".agents/skills/shadcn/SKILL.md"),
			"utf8",
		);

		expect(shadcnSkill).toContain(`\n${supportedKey}`);

		for (const skillFile of listSkillFiles(join(repoRoot, ".agents/skills"))) {
			const skillSource = readFileSync(skillFile, "utf8");
			expect(skillSource).not.toContain(`\n${unsupportedKey}`);
		}
	});

	test("extends artifact cleanup to packaged release output", () => {
		const cleanupScript = readFromRepo("scripts/clean-artifacts.sh");
		expect(cleanupScript).toContain("packages/bardo-mcp/dist/release");
		expect(cleanupScript).toContain("packages/bardo-mcp/.turbo");
		expect(cleanupScript).toContain(
			'rm -f "$ROOT_DIR/website/tsconfig.tsbuildinfo"',
		);
	});

	test("keeps local env templates and smoke docs aligned with the bridge-first V1 contract", () => {
		const websiteEnvExample = readFromRepo("website/.env.example");
		const websiteEnvLocal = readFromRepo("website/.env.local");
		const mcpEnvExample = readFromRepo("mcp/.env.example");
		const stagingChecklist = readFromRepo("docs/staging-smoke-checklist.md");
		const localDocs = readFromRepo("packages/bardo-mcp/src/local-docs.ts");
		const runtimeSmoke = readFromRepo(
			"packages/bardo-mcp/src/runtime.smoke.test.ts",
		);

		expect(websiteEnvExample).not.toContain("BARDO_MCP_BASE_URL");
		expect(websiteEnvExample).not.toContain("NEXT_PUBLIC_MCP_BASE_URL");
		expect(websiteEnvExample).toContain(
			'E2E_CLERK_PASSWORD="YourEmailClerkTest123!$"',
		);
		expect(websiteEnvLocal).toContain(
			'E2E_CLERK_PASSWORD="YourEmailClerkTest123!$"',
		);
		expect(websiteEnvLocal).toContain(
			'E2E_CLERK_TEST_PHONE_NUMBER="+15555550100"',
		);
		expect(mcpEnvExample).toContain("bridge/session credentials");
		expect(stagingChecklist).toContain("/api/connect/bridge-session/start");
		expect(stagingChecklist).not.toContain("/api/connect/cli-token");
		expect(stagingChecklist).not.toContain("/api/connect/snippets");
		expect(localDocs).toContain("approve the bridge in your browser");
		expect(localDocs).toContain("hosted control plane");
		expect(localDocs).not.toContain("last_session_diff");
		expect(runtimeSmoke).toContain("bridge-authenticated connect");
	});

	test("keeps staging smoke focused on the paid bridge-first V1 flow", () => {
		const stagingSmokeSource = readFromRepo("scripts/staging-smoke.ts");

		expect(stagingSmokeSource).toContain("/api/connect/bridge-session/start");
		expect(stagingSmokeSource).toContain("/api/connect/bridge-session/approve");
		expect(stagingSmokeSource).toContain("world_state_overview");
		expect(stagingSmokeSource).not.toContain("/api/connect/cli-token");
		expect(stagingSmokeSource).not.toContain("/api/connect/snippets");
		expect(stagingSmokeSource).not.toContain("/api/connect/cli-exchange");
		expect(stagingSmokeSource).not.toContain("last_session_diff");
	});
});
