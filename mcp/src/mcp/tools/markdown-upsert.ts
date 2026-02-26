import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getCanonicalProtectionReason } from "../../domain/canon/path-policy";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import {
	ensureMarkdownPath,
	ensureParentDirectoryExists,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const mergeStrategySchema = z
	.enum(["replace", "append", "prepend"])
	.describe("How to merge body content when file already exists");

const markdownFrontmatterSchema = z.object({
	description: z
		.string()
		.min(1)
		.describe("Short description of what the markdown file is for"),
	title: z.string().min(1).describe("Name/title of the content in this file"),
});

const markdownUpsertInputSchema = z.object({
	path: z
		.string()
		.min(1)
		.describe(
			"Relative markdown path under bardo root, e.g. `party/characters.md`",
		),
	title: z.string().optional().describe("Frontmatter title override"),
	description: z
		.string()
		.optional()
		.describe("Frontmatter description override"),
	content: z
		.string()
		.optional()
		.describe("Body markdown to write or merge based on strategy"),
	mergeStrategy: mergeStrategySchema.optional(),
});

const markdownUpsertOutputSchema = z.object({
	success: z.boolean().describe("True when upsert succeeded"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	filePath: z.string().describe("Absolute markdown file path"),
	fileExistedBefore: z
		.boolean()
		.describe("Whether file existed before this call"),
	createdNow: z.boolean().describe("Whether file was created by this call"),
	frontmatter: markdownFrontmatterSchema.describe(
		"Final normalized frontmatter after merge",
	),
	content: z.string().describe("Final markdown body written to disk"),
});

type MarkdownUpsertOutput = z.infer<typeof markdownUpsertOutputSchema>;

export function registerMarkdownUpsertTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"markdown_upsert",
		{
			title: "Create Or Update Markdown",
			description:
				"Create or update non-canonical markdown while preserving frontmatter (`description`, `title`) and safely merging content. Protected canonical paths are blocked.",
			inputSchema: markdownUpsertInputSchema,
			outputSchema: markdownUpsertOutputSchema,
			annotations: {
				title: "Create Or Update Markdown",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({
			path: relativePath,
			title,
			description,
			content,
			mergeStrategy,
		}) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				const protectionReason = getCanonicalProtectionReason(relativePath);
				if (protectionReason) {
					const output: MarkdownUpsertOutput = {
						success: false,
						message:
							`${protectionReason} Use append_event, regenerate_projection, ` +
							"or domain-specific canonical tools instead of markdown_upsert.",
						rootPath: bardoRoot,
						filePath: "",
						fileExistedBefore: false,
						createdNow: false,
						frontmatter: {
							description: description ?? "What this file is for",
							title: title ?? "Untitled",
						},
						content: "",
					};
					return makeToolResult(output, true);
				}

				const filePath = resolvePathInsideRoot(bardoRoot, relativePath);
				ensureMarkdownPath(filePath);
				const raw = await readTextIfExists(filePath);
				const fileExistedBefore = raw !== null;
				const existingParsed = raw ? parseMarkdown(raw) : null;

				const finalFrontmatter = {
					description:
						description ??
						existingParsed?.frontmatter.description ??
						"What this file is for",
					title:
						title ??
						existingParsed?.frontmatter.title ??
						path.basename(filePath, ".md"),
				};

				let finalContent = existingParsed?.content ?? "";
				if (typeof content === "string") {
					const strategy = mergeStrategy ?? "replace";
					if (!fileExistedBefore || strategy === "replace") {
						finalContent = content;
					} else if (strategy === "append") {
						finalContent = finalContent
							? `${finalContent.replace(/\s+$/g, "")}\n\n${content}`
							: content;
					} else {
						finalContent = finalContent
							? `${content.replace(/\s+$/g, "")}\n\n${finalContent}`
							: content;
					}
				}

				const markdown = renderMarkdown(finalFrontmatter, finalContent);
				await ensureParentDirectoryExists(filePath);
				await writeFile(filePath, markdown, "utf8");

				const output: MarkdownUpsertOutput = {
					success: true,
					message: fileExistedBefore
						? "Markdown file updated successfully."
						: "Markdown file created successfully.",
					rootPath: bardoRoot,
					filePath,
					fileExistedBefore,
					createdNow: !fileExistedBefore,
					frontmatter: finalFrontmatter,
					content: finalContent,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: MarkdownUpsertOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to upsert markdown: ${error.message}`
							: "Failed to upsert markdown.",
					rootPath: bardoRoot,
					filePath: "",
					fileExistedBefore: false,
					createdNow: false,
					frontmatter: {
						description: description ?? "What this file is for",
						title: title ?? "Untitled",
					},
					content: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
