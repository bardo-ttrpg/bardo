import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { parseMarkdown } from "../../domain/markdown/markdown";
import { loadPreferredCurrentState } from "../../domain/projections/preferred-state";
import {
	ensureMarkdownPath,
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const stateGetInputSchema = z.object({
	path: z
		.string()
		.optional()
		.describe(
			"Optional relative state markdown path under bardo root. When omitted, reads preferred current state (projection first, then legacy fallback).",
		),
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
	stateSource: z
		.enum([
			"projection",
			"legacy_state",
			"explicit_path",
			"empty_default",
			"strict_blocked_legacy",
			"strict_stale_projection",
		])
		.describe("Source used to read returned state payload"),
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
				if (!relativePath) {
					const preferred = await loadPreferredCurrentState({
						bardoRoot,
						consumer: "state_get",
					});
					const output: StateGetOutput = {
						success: true,
						message:
							preferred.source === "projection"
								? "State read successfully from current-state projection."
								: preferred.source === "legacy_state"
									? "State read from legacy state file because projection is missing."
									: "No state files found. Returned default empty state.",
						rootPath: bardoRoot,
						filePath: preferred.chosen.path,
						exists: preferred.chosen.exists,
						defaulted: preferred.source === "empty_default",
						frontmatter: preferred.chosen.frontmatter,
						stateSource: preferred.source,
						state: preferred.chosen.state,
						rawContent: preferred.chosen.rawContent,
					};
					return makeToolResult(output);
				}

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
						stateSource: "explicit_path",
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
					stateSource: "explicit_path",
					state,
					rawContent: parsed.content,
				};
				return makeToolResult(output);
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.startsWith("STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED")
				) {
					const strictOutput: StateGetOutput = {
						success: false,
						message:
							"Strict canonical mode blocked legacy fallback read. Regenerate or restore projections/current-state.md.",
						rootPath: bardoRoot,
						filePath: resolvePathInsideRoot(bardoRoot, "state/current.md"),
						exists: true,
						defaulted: false,
						frontmatter: {},
						stateSource: "strict_blocked_legacy",
						state: {},
						rawContent: "",
					};
					return makeToolResult(strictOutput, true);
				}
				if (
					error instanceof Error &&
					error.message.startsWith("STRICT_CANONICAL_STALE_PROJECTION")
				) {
					const strictOutput: StateGetOutput = {
						success: false,
						message:
							"Strict canonical mode blocked stale projection read. Regenerate projections/current-state.md from canonical events.",
						rootPath: bardoRoot,
						filePath: resolvePathInsideRoot(
							bardoRoot,
							"projections/current-state.md",
						),
						exists: true,
						defaulted: false,
						frontmatter: {},
						stateSource: "strict_stale_projection",
						state: {},
						rawContent: "",
					};
					return makeToolResult(strictOutput, true);
				}
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
					stateSource: "explicit_path",
					state: {},
					rawContent: "",
				};
				return makeToolResult(output, true);
			}
		},
	);
}
