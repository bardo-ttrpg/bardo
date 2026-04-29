export type ReleaseCleanupArgs = {
	confirm: boolean;
	limit: number | undefined;
};

export function parseReleaseCleanupArgs(args: string[]): ReleaseCleanupArgs {
	let confirm = false;
	let limit: number | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--confirm") {
			confirm = true;
			continue;
		}
		if (arg === "--limit") {
			const raw = args[index + 1];
			index += 1;
			const parsed = Number.parseInt(raw ?? "", 10);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				throw new Error("--limit must be a positive integer.");
			}
			limit = parsed;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return { confirm, limit };
}

export function releaseCleanupModeFromArgs(args: string[]): ReleaseCleanupArgs {
	return parseReleaseCleanupArgs(args);
}
