import { validateE2EAuthEnv } from "./validate-e2e-auth-env-lib";

const result = validateE2EAuthEnv(process.env);

for (const warning of result.warnings) {
	console.warn(`warning: ${warning}`);
}

if (result.errors.length > 0) {
	for (const error of result.errors) {
		console.error(`error: ${error}`);
	}
	process.exit(1);
}

const authSubject = result.email ?? result.phoneNumber ?? "Clerk test identity";

console.log(`E2E auth env looks valid for ${result.strategy}: ${authSubject}.`);
