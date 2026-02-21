import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	type ContextQueryFocus,
	type ContextQueryMode,
	retrieveContext,
} from "../../domain/context/retrieval";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const contextQueryInputSchema = z.object({
	query: z
		.string()
		.max(4_000)
		.default("")
		.describe("Search text for context retrieval and relevance ranking"),
	mode: z
		.enum(["fast", "deep"])
		.default("fast")
		.describe(
			"Retrieval profile: `fast` for lightweight context, `deep` for wider recall",
		),
	focus: z
		.enum(["all", "world", "entities", "quests", "state"])
		.default("all")
		.describe("Directory focus filter"),
	limit: z
		.number()
		.int()
		.min(1)
		.max(50)
		.optional()
		.describe("Max results override. Defaults depend on mode."),
});

const contextQueryOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	indexPath: z.string(),
	mode: z.enum(["fast", "deep"]),
	focus: z.enum(["all", "world", "entities", "quests", "state"]),
	query: z.string(),
	docsIndexed: z.number().int().nonnegative(),
	results: z.array(
		z.object({
			relativePath: z.string(),
			title: z.string(),
			sourceDir: z.string(),
			snippet: z.string(),
			bodyChars: z.number().int().nonnegative(),
			matchScore: z.number().int().nonnegative(),
		}),
	),
});

type ContextQueryOutput = z.infer<typeof contextQueryOutputSchema>;

export function registerContextQueryTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"context_query",
		{
			title: "Context Query",
			description:
				"Build and query the context repository index to retrieve relevant campaign memory for reasoning and continuity.",
			inputSchema: contextQueryInputSchema,
			outputSchema: contextQueryOutputSchema,
			annotations: {
				title: "Context Query",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ query, mode, focus, limit }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const resolvedMode = mode as ContextQueryMode;
			const resolvedFocus = focus as ContextQueryFocus;
			const resolvedLimit = limit ?? (resolvedMode === "fast" ? 8 : 20);

			try {
				const context = await retrieveContext({
					bardoRoot,
					query,
					mode: resolvedMode,
					focus: resolvedFocus,
					limit: resolvedLimit,
				});

				const output: ContextQueryOutput = {
					success: true,
					message:
						context.results.length > 0
							? "Context retrieved successfully."
							: "Context index refreshed, but no matching records were found.",
					rootPath: bardoRoot,
					indexPath: context.indexPath,
					mode: resolvedMode,
					focus: resolvedFocus,
					query,
					docsIndexed: context.docsIndexed,
					results: context.results,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: ContextQueryOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to query context: ${error.message}`
							: "Failed to query context.",
					rootPath: bardoRoot,
					indexPath: "",
					mode: resolvedMode,
					focus: resolvedFocus,
					query,
					docsIndexed: 0,
					results: [],
				};
				return makeToolResult(output, true);
			}
		},
	);
}
