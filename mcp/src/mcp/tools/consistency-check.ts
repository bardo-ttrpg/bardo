import { readdir } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { safeParseState } from "../../domain/campaign/state";
import { parseMarkdown } from "../../domain/markdown/markdown";
import {
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const consistencyCheckInputSchema = z.object({
	includeWarnings: z
		.boolean()
		.default(true)
		.describe("Include warning-level findings in addition to errors"),
});

const consistencyCheckOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	issues: z.array(
		z.object({
			severity: z.enum(["error", "warning"]),
			code: z.string(),
			message: z.string(),
			path: z.string().optional(),
		}),
	),
	errorCount: z.number().int().nonnegative(),
	warningCount: z.number().int().nonnegative(),
});

type ConsistencyIssue = {
	severity: "error" | "warning";
	code: string;
	message: string;
	path?: string;
};

type ConsistencyCheckOutput = z.infer<typeof consistencyCheckOutputSchema>;

export function registerConsistencyCheckTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"consistency_check",
		{
			title: "Consistency Check",
			description:
				"Validate core canon consistency across state, locations, and referenced NPC files.",
			inputSchema: consistencyCheckInputSchema,
			outputSchema: consistencyCheckOutputSchema,
			annotations: {
				title: "Consistency Check",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ includeWarnings }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
			const issues: ConsistencyIssue[] = [];

			try {
				const stateRaw = await readTextIfExists(statePath);
				const state = safeParseState(
					stateRaw ? parseMarkdown(stateRaw).content : "",
				);

				if (!state.locations[state.currentLocation]) {
					issues.push({
						severity: "error",
						code: "STATE_CURRENT_LOCATION_MISSING",
						message:
							"`currentLocation` points to a location missing from `state.locations`.",
						path: statePath,
					});
				}

				for (const [locationSlug, location] of Object.entries(
					state.locations,
				)) {
					if (!location.name?.trim()) {
						issues.push({
							severity: "warning",
							code: "LOCATION_NAME_EMPTY",
							message: `Location '${locationSlug}' has an empty name.`,
							path: statePath,
						});
					}

					for (const npcId of location.npcIds) {
						const npcPath = resolvePathInsideRoot(
							bardoRoot,
							`entities/${npcId}.md`,
						);
						const npcRaw = await readTextIfExists(npcPath);
						if (npcRaw === null) {
							issues.push({
								severity: "warning",
								code: "NPC_REFERENCE_MISSING_FILE",
								message: `Location '${locationSlug}' references missing NPC file '${npcId}.md'.`,
								path: npcPath,
							});
						}
					}
				}

				const eventsDir = resolvePathInsideRoot(bardoRoot, "world/events");
				try {
					const entries = await readdir(eventsDir, { withFileTypes: true });
					const eventIds = new Set<string>();
					for (const entry of entries) {
						if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
							continue;
						}
						const eventId = entry.name.replace(/\.md$/i, "");
						if (eventIds.has(eventId)) {
							issues.push({
								severity: "warning",
								code: "EVENT_DUPLICATE_ID",
								message: `Duplicate event id detected: '${eventId}'.`,
								path: resolvePathInsideRoot(
									bardoRoot,
									`world/events/${entry.name}`,
								),
							});
						}
						eventIds.add(eventId);
					}
				} catch {
					// events directory may not exist yet
				}

				const filtered = includeWarnings
					? issues
					: issues.filter((issue) => issue.severity === "error");
				const errorCount = filtered.filter(
					(issue) => issue.severity === "error",
				).length;
				const warningCount = filtered.filter(
					(issue) => issue.severity === "warning",
				).length;

				const output: ConsistencyCheckOutput = {
					success: errorCount === 0,
					message:
						errorCount === 0
							? "Consistency check completed without blocking issues."
							: "Consistency check found blocking canon/state issues.",
					rootPath: bardoRoot,
					issues: filtered,
					errorCount,
					warningCount,
				};
				return makeToolResult(output, errorCount > 0);
			} catch (error) {
				const output: ConsistencyCheckOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to run consistency check: ${error.message}`
							: "Failed to run consistency check.",
					rootPath: bardoRoot,
					issues: [],
					errorCount: 1,
					warningCount: 0,
				};
				return makeToolResult(output, true);
			}
		},
	);
}
