import { queryContextDocs, refreshContextIndex } from "./indexer";

export type ContextQueryMode = "fast" | "deep";
export type ContextQueryFocus =
	| "all"
	| "world"
	| "entities"
	| "quests"
	| "state";

export async function retrieveContext(args: {
	bardoRoot: string;
	query: string;
	mode: ContextQueryMode;
	focus: ContextQueryFocus;
	limit: number;
}): Promise<{
	indexPath: string;
	docsIndexed: number;
	indexRebuilt: boolean;
	results: Array<{
		relativePath: string;
		title: string;
		sourceDir: string;
		snippet: string;
		bodyChars: number;
		matchScore: number;
	}>;
}> {
	const refreshed = await refreshContextIndex(args.bardoRoot);
	const results = queryContextDocs({
		bardoRoot: args.bardoRoot,
		query: args.query.trim(),
		mode: args.mode,
		focus: args.focus,
		limit: args.limit,
	});

	return {
		indexPath: refreshed.indexPath,
		docsIndexed: refreshed.docsIndexed,
		indexRebuilt: refreshed.indexRebuilt,
		results,
	};
}
