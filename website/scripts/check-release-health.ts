import { checkReleaseHealth } from "./check-release-health-lib";

const result = await checkReleaseHealth(process.env);

if (result.skipped) {
	console.log("[release-health] skipped outside enforced release contexts");
	process.exit(0);
}

if (result.errors.length > 0) {
	console.error("[release-health] invalid release configuration:");
	for (const error of result.errors) {
		console.error(`- ${error}`);
	}
	process.exit(1);
}

if (result.warnings.length > 0) {
	console.warn("[release-health] warnings:");
	for (const warning of result.warnings) {
		console.warn(`- ${warning}`);
	}
}

console.log(
	`[release-health] passed for ${result.release ?? "unknown release"}`,
);
