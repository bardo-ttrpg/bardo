import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	ensureMarkdownPath,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../lib/filesystem";
import { parseMarkdown } from "../lib/markdown";
import { makeToolResult } from "../lib/tool-result";
import type { AuthContext } from "../types";

const stateGetInputSchema = z.object({
	path: z
		.string()
		.default("state/current.md")
		.describe("Relative state markdown file path under bardo root"),
});

const stateGetOutputSchema = z.object({
	success: z.boolean().describe("True when operation succeeded"),
	message: z.string().describe("Human-readable summary"),
	rootPath: z.string().describe("Absolute bardo root path"),
	filePath: z.string().describe("Absolute markdown file path"),
	exists: z.boolean().describe("Whether the state file existed"),
	defaulted: z
		.boolean()
		.describe(
			"True when a default empty state was returned because file was missing",
		),
	frontmatter: z
		.record(z.string(), z.string())
		.describe("Parsed frontmatter key/value map"),
	state: z.record(z.string(), z.unknown()).describe("Parsed JSON state object"),
	rawContent: z.string().describe("Raw markdown body content"),
});

type StateGetOutput = z.infer<typeof stateGetOutputSchema>;

export function registerStateGetTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"state_get",
		{
			title: "Get Campaign State",
			description:
				"Read a state markdown file (default `state/current.md`) and parse JSON body into structured campaign state.",
			inputSchema: stateGetInputSchema,
			outputSchema: stateGetOutputSchema,
			annotations: {
				title: "Get Campaign State",
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
					const output: StateGetOutput = {
						success: false,
						message: "State file does not exist.",
						rootPath: bardoRoot,
						filePath,
						exists: false,
						defaulted: true,
						frontmatter: {},
						state: {},
						rawContent: "",
					};
					return makeToolResult({
						...output,
						success: true,
						message:
							"State file does not exist yet. Returned default empty state; call state_set or player_action to initialize it.",
					});
				}

				const parsed = parseMarkdown(raw);
				const trimmed = parsed.content.trim();
				const state = trimmed
					? (JSON.parse(trimmed) as Record<string, unknown>)
					: {};

				const output: StateGetOutput = {
					success: true,
					message: "State read successfully.",
					rootPath: bardoRoot,
					filePath,
					exists: true,
					defaulted: false,
					frontmatter: parsed.frontmatter,
					state,
					rawContent: parsed.content,
				};
				return makeToolResult(output);
			} catch (error) {
				const output: StateGetOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to read state: ${error.message}`
							: "Failed to read state.",
					rootPath: bardoRoot,
					filePath: "",
					exists: false,
					defaulted: false,
					frontmatter: {},
					state: {},
					rawContent: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
