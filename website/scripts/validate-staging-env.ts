import { validateStagingEnv } from "./validate-staging-env-lib";

const result = validateStagingEnv(process.env);

if (result.errors.length > 0) {
	console.error("[staging-env] invalid website staging configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[staging-env] website staging warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log("[staging-env] website staging configuration passed");
