import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

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
	const client = new ConvexHttpClient(convexUrl);
	const before = await client.query(api.maintenance.storageSummary, { token });
	const orphanCleanup = await client.mutation(
		api.maintenance.deleteOrphanedStorage,
		{ token },
	);
	const recordCleanup = await client.mutation(
		api.maintenance.deleteExpiredWebsiteBackendRecords,
		{ token, nowMs: Date.now() },
	);
	const after = await client.query(api.maintenance.storageSummary, { token });
	console.log(
		JSON.stringify(
			{
				before,
				orphanCleanup,
				recordCleanup,
				after,
			},
			null,
			2,
		),
	);
}

await main();
