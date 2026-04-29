import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { parseReleaseCleanupArgs } from "./cleanup-convex-release-files-lib";

async function main() {
	const convexUrl =
		process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!convexUrl) {
		throw new Error("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required.");
	}
	const token = process.env.BARDO_CONVEX_BACKEND_SECRET;
	if (!token) {
		throw new Error("BARDO_CONVEX_BACKEND_SECRET is required.");
	}
	const { confirm, limit } = parseReleaseCleanupArgs(process.argv.slice(2));
	const client = new ConvexHttpClient(convexUrl);
	const result = await client.mutation(
		api.maintenance.deleteReleaseFilesAndStorage,
		{
			token,
			dryRun: !confirm,
			limit,
		},
	);
	console.log(JSON.stringify(result, null, 2));
	if (!confirm) {
		console.log(
			"Dry run only. Re-run with --confirm after GitHub Release installs are verified.",
		);
	}
}

await main();
