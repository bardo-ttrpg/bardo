import { shouldEnforce, validateDeployEnv } from "./validate-deploy-env-lib";

const env = process.env;

const result = validateDeployEnv(env);

if (result.skipped) {
	console.log("[deploy-env] skipping production-only validation");
	process.exit(0);
}

if (result.errors.length > 0) {
	console.error("[deploy-env] production validation warning:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	if (shouldEnforce(env)) {
		process.exit(1);
	}
	console.error(
		"[deploy-env] continuing because BARDO_ENFORCE_LIVE_CLERK_KEYS is not set to true",
	);
	process.exit(0);
}

if (result.warnings.length > 0) {
	console.warn("[deploy-env] production validation note:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log("[deploy-env] production validation passed");
