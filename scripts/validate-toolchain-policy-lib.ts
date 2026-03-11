export type ToolchainPackageManifest = {
	path: string;
	packageManager?: string;
	scripts?: Record<string, string>;
};

type ToolchainPolicyInput = {
	lockfiles: string[];
	packageJsons: ToolchainPackageManifest[];
};

const FORBIDDEN_SCRIPT_TOOL_PATTERN = /\b(?:npm|npx|pnpm|pnpx|yarn|yarnpkg)\b/;
const FORBIDDEN_LOCKFILE_PATTERN =
	/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

function validatePackageManager(
	manifest: ToolchainPackageManifest,
	errors: string[],
) {
	if (!manifest.packageManager?.startsWith("bun@")) {
		errors.push(`${manifest.path} must declare packageManager as bun@...`);
	}
}

function validateScripts(manifest: ToolchainPackageManifest, errors: string[]) {
	for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
		if (FORBIDDEN_SCRIPT_TOOL_PATTERN.test(command)) {
			errors.push(
				`${manifest.path} script "${name}" must not use npm, npx, pnpm, pnpx, or yarn.`,
			);
		}
	}
}

function validateWebsiteScripts(
	manifest: ToolchainPackageManifest,
	errors: string[],
) {
	if (!manifest.path.endsWith("/website/package.json")) {
		return;
	}

	const scripts = manifest.scripts ?? {};
	for (const name of ["dev", "dev:e2e", "build"] as const) {
		const command = scripts[name];
		if (!command?.includes("--turbopack")) {
			errors.push(
				`${manifest.path} script "${name}" must include --turbopack.`,
			);
		}
		if (command?.includes("--webpack")) {
			errors.push(`${manifest.path} script "${name}" must not force webpack.`);
		}
	}

	const analyzeCommand = scripts["build:analyze"];
	if (!analyzeCommand?.includes("--turbopack")) {
		errors.push(
			`${manifest.path} script "build:analyze" must include --turbopack.`,
		);
	}
	if (!analyzeCommand?.includes("--experimental-analyze")) {
		errors.push(
			`${manifest.path} script "build:analyze" must include --experimental-analyze for Turbopack bundle inspection.`,
		);
	}
	if (analyzeCommand?.includes("--webpack")) {
		errors.push(
			`${manifest.path} script "build:analyze" must not force webpack.`,
		);
	}
}

export function validateToolchainPolicy(input: ToolchainPolicyInput): string[] {
	const errors: string[] = [];

	for (const lockfile of input.lockfiles) {
		if (FORBIDDEN_LOCKFILE_PATTERN.test(lockfile)) {
			errors.push(`Remove forbidden lockfile: ${lockfile}`);
		}
	}

	for (const manifest of input.packageJsons) {
		validatePackageManager(manifest, errors);
		validateScripts(manifest, errors);
		validateWebsiteScripts(manifest, errors);
	}

	return errors;
}
