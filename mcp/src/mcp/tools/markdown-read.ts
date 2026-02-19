import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { parseMarkdown } from "../../domain/markdown/markdown";
import {
	ensureMarkdownPath,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const markdownReadInputSchema = z.object({
	path: z
		.string()
		.min(1)
		.describe(
			"Relative markdown path under bardo root, e.g. `world/locations.md`",
		),
});

const markdownReadOutputSchema = z.object({
	success: z.boolean().describe("True when read/parse succeeded"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	filePath: z.string().describe("Absolute markdown file path"),
	exists: z.boolean().describe("Whether file exists"),
	frontmatter: z
		.record(z.string(), z.string())
		.describe("Parsed frontmatter key/value map"),
	content: z.string().describe("Markdown body content without frontmatter"),
});

type MarkdownReadOutput = z.infer<typeof markdownReadOutputSchema>;

export function registerMarkdownReadTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"markdown_read",
		{
			title: "Read Markdown File",
			description:
				"Read a markdown file under the authorized bardo workspace and parse frontmatter/body.",
			inputSchema: markdownReadInputSchema,
			outputSchema: markdownReadOutputSchema,
			annotations: {
				title: "Read Markdown File",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ path: relativePath }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				const filePath = resolvePathInsideRoot(bardoRoot, relativePath);
				ensureMarkdownPath(filePath);
				const raw = await readTextIfExists(filePath);
				if (raw === null) {
					const output: MarkdownReadOutput = {
						success: false,
						message: "Markdown file does not exist.",
						rootPath: bardoRoot,
						filePath,
						exists: false,
						frontmatter: {},
						content: "",
					};
					return makeToolResult(output, true);
				}

				const parsed = parseMarkdown(raw);
				const output: MarkdownReadOutput = {
					success: true,
					message: "Markdown file read successfully.",
					rootPath: bardoRoot,
					filePath,
					exists: true,
					frontmatter: parsed.frontmatter,
					content: parsed.content,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: MarkdownReadOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to read markdown: ${error.message}`
							: "Failed to read markdown.",
					rootPath: bardoRoot,
					filePath: "",
					exists: false,
					frontmatter: {},
					content: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
