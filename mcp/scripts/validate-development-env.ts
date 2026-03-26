import { validateDevelopmentEnv } from "./validate-development-env-lib";

const result = validateDevelopmentEnv(Bun.env);

if (result.errors.length > 0) {
	console.error("[development-env] invalid mcp development configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[development-env] mcp development warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log("[development-env] mcp development configuration passed");
