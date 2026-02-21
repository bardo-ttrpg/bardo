import { queryContextDocs, rebuildContextIndex } from "./indexer";

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
	results: Array<{
		relativePath: string;
		title: string;
		sourceDir: string;
		snippet: string;
		bodyChars: number;
		matchScore: number;
	}>;
}> {
	const rebuilt = await rebuildContextIndex(args.bardoRoot);
	const results = queryContextDocs({
		bardoRoot: args.bardoRoot,
		query: args.query.trim(),
		mode: args.mode,
		focus: args.focus,
		limit: args.limit,
	});

	return {
		indexPath: rebuilt.indexPath,
		docsIndexed: rebuilt.docsIndexed,
		results,
	};
}
