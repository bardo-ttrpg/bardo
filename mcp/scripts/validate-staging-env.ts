import { validateStagingEnv } from "./validate-staging-env-lib";

const result = validateStagingEnv(Bun.env);

if (result.errors.length > 0) {
	console.error("[staging-env] invalid mcp staging configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[staging-env] mcp staging warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log("[staging-env] mcp staging configuration passed");
