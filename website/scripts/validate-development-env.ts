import { validateDevelopmentEnv } from "./validate-development-env-lib";

const result = validateDevelopmentEnv(process.env);

if (result.errors.length > 0) {
	console.error("[development-env] invalid website development configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[development-env] website development warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log("[development-env] website development configuration passed");
