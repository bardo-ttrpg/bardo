function normalize(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function isProductionDeploy(env: NodeJS.ProcessEnv): boolean {
	return env.VERCEL_ENV === "production";
}

function shouldEnforce(env: NodeJS.ProcessEnv): boolean {
	return env.BARDO_ENFORCE_LIVE_CLERK_KEYS === "true";
}

function requirePrefix(
	value: string | undefined,
	prefix: string,
	label: string,
	errors: string[],
) {
	if (!value) {
		errors.push(`${label} is missing`);
		return;
	}

	if (!value.startsWith(prefix)) {
		errors.push(`${label} must start with ${prefix} for production`);
	}
}

const env = process.env;

if (!isProductionDeploy(env)) {
	console.log("[deploy-env] skipping production-only validation");
	process.exit(0);
}

const errors: string[] = [];

requirePrefix(
	normalize(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
	"pk_live_",
	"NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
	errors,
);
requirePrefix(
	normalize(env.CLERK_SECRET_KEY),
	"sk_live_",
	"CLERK_SECRET_KEY",
	errors,
);

if (errors.length > 0) {
	console.error("[deploy-env] production validation warning:");
	for (const error of errors) {
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

console.log("[deploy-env] production validation passed");
