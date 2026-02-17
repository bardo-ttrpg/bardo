import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	ensureMarkdownPath,
	ensureParentDirectoryExists,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../lib/filesystem";
import { parseMarkdown, renderMarkdown } from "../lib/markdown";
import { makeToolResult } from "../lib/tool-result";
import type { AuthContext } from "../types";

const markdownFrontmatterSchema = z.object({
	description: z
		.string()
		.min(1)
		.describe("Short description of what the markdown file is for"),
	title: z.string().min(1).describe("Name/title of the content in this file"),
});

const stateSetInputSchema = z.object({
	path: z
		.string()
		.default("state/current.md")
		.describe("Relative state markdown file path under bardo root"),
	state: z
		.record(z.string(), z.unknown())
		.describe("State object to write to markdown body as pretty JSON"),
	title: z.string().optional().describe("Optional frontmatter title override"),
	description: z
		.string()
		.optional()
		.describe("Optional frontmatter description override"),
});

const stateSetOutputSchema = z.object({
	success: z.boolean().describe("True when operation succeeded"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	filePath: z.string().describe("Absolute markdown file path"),
	fileExistedBefore: z.boolean().describe("Whether file existed before update"),
	frontmatter: markdownFrontmatterSchema.describe(
		"Final normalized frontmatter after update",
	),
	state: z
		.record(z.string(), z.unknown())
		.describe("State object written to markdown"),
	rawContent: z.string().describe("Raw markdown body written"),
});

type StateSetOutput = z.infer<typeof stateSetOutputSchema>;

export function registerStateSetTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"state_set",
		{
			title: "Set Campaign State",
			description:
				"Write campaign state as JSON in markdown body (default `state/current.md`) with frontmatter metadata for persistent memory.",
			inputSchema: stateSetInputSchema,
			outputSchema: stateSetOutputSchema,
			annotations: {
				title: "Set Campaign State",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ path: relativePath, state, title, description }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				const filePath = resolvePathInsideRoot(bardoRoot, relativePath);
				ensureMarkdownPath(filePath);
				const raw = await readTextIfExists(filePath);
				const fileExistedBefore = raw !== null;
				const parsed = raw
					? parseMarkdown(raw)
					: { frontmatter: {}, content: "" };
				const rawContent = JSON.stringify(state, null, 2);

				const finalFrontmatter = {
					description:
						description ??
						parsed.frontmatter.description ??
						"Current campaign state and memory snapshot",
					title: title ?? parsed.frontmatter.title ?? "Campaign State",
				};

				await ensureParentDirectoryExists(filePath);
				await writeFile(
					filePath,
					renderMarkdown(finalFrontmatter, rawContent),
					"utf8",
				);

				const output: StateSetOutput = {
					success: true,
					message: fileExistedBefore
						? "State updated successfully."
						: "State file created successfully.",
					rootPath: bardoRoot,
					filePath,
					fileExistedBefore,
					frontmatter: finalFrontmatter,
					state,
					rawContent,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: StateSetOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to set state: ${error.message}`
							: "Failed to set state.",
					rootPath: bardoRoot,
					filePath: "",
					fileExistedBefore: false,
					frontmatter: {
						description:
							description ?? "Current campaign state and memory snapshot",
						title: title ?? "Campaign State",
					},
					state: {},
					rawContent: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
