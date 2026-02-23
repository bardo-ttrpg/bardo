import { readdir } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { readCanonicalEvents } from "../../domain/events/store";
import { deriveCurrentStateFromEvents } from "../../domain/projections/current-state";
import { loadPreferredCurrentState } from "../../domain/projections/preferred-state";
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

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const keys = Object.keys(record).sort();
		return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

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
			const issues: ConsistencyIssue[] = [];

			try {
				const preferredState = await loadPreferredCurrentState({
					bardoRoot,
					consumer: "consistency_check",
				});
				const state = preferredState.chosen.state;
				const stateReadPath = preferredState.chosen.path;

				if (preferredState.source === "legacy_state") {
					issues.push({
						severity: "warning",
						code: "STATE_READ_FROM_LEGACY_FALLBACK",
						message:
							"Projection state is missing. Consistency check fell back to legacy state/current.md.",
						path: preferredState.legacyState.path,
					});
				}

				if (!state.locations[state.currentLocation]) {
					issues.push({
						severity: "error",
						code: "STATE_CURRENT_LOCATION_MISSING",
						message:
							"`currentLocation` points to a location missing from `state.locations`.",
						path: stateReadPath,
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
							path: stateReadPath,
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

				const canonicalEvents = await readCanonicalEvents({ bardoRoot });
				if (canonicalEvents.length > 0) {
					const derivedState = deriveCurrentStateFromEvents(canonicalEvents);
					const derivedSignature = stableStringify(derivedState);

					if (!preferredState.projection.exists) {
						issues.push({
							severity: "warning",
							code: "PROJECTION_MISSING_FOR_EVENTS",
							message:
								"Canonical events exist but projections/current-state.md is missing.",
							path: preferredState.projection.path,
						});
					}

					if (preferredState.projection.exists) {
						const projectionSignature = stableStringify(
							preferredState.projection.state,
						);
						if (projectionSignature !== derivedSignature) {
							issues.push({
								severity: "warning",
								code: "PROJECTION_EVENT_DRIFT",
								message:
									"Projection state diverges from canonical event-derived state. Regenerate projections.",
								path: preferredState.projection.path,
							});
						}
					}

					if (preferredState.legacyState.exists) {
						const legacySignature = stableStringify(
							preferredState.legacyState.state,
						);
						if (legacySignature !== derivedSignature) {
							issues.push({
								severity: "warning",
								code: "LEGACY_STATE_EVENT_DRIFT",
								message:
									"Legacy state/current.md diverges from canonical event-derived state.",
								path: preferredState.legacyState.path,
							});
						}
					}
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
				if (
					error instanceof Error &&
					error.message.startsWith("STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED")
				) {
					const output: ConsistencyCheckOutput = {
						success: false,
						message:
							"Strict canonical mode blocked consistency check because projection fallback would use legacy state/current.md.",
						rootPath: bardoRoot,
						issues: [
							{
								severity: "error",
								code: "STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED",
								message:
									"Projection is missing and strict canonical mode disallows legacy fallback.",
								path: resolvePathInsideRoot(bardoRoot, "state/current.md"),
							},
						],
						errorCount: 1,
						warningCount: 0,
					};
					return makeToolResult(output, true);
				}
				if (
					error instanceof Error &&
					error.message.startsWith("STRICT_CANONICAL_STALE_PROJECTION")
				) {
					const output: ConsistencyCheckOutput = {
						success: false,
						message:
							"Strict canonical mode blocked consistency check because projection is stale relative to canonical events.",
						rootPath: bardoRoot,
						issues: [
							{
								severity: "error",
								code: "STRICT_CANONICAL_STALE_PROJECTION",
								message:
									"Projection metadata indicates stale event sequence. Regenerate projections/current-state.md.",
								path: resolvePathInsideRoot(
									bardoRoot,
									"projections/current-state.md",
								),
							},
						],
						errorCount: 1,
						warningCount: 0,
					};
					return makeToolResult(output, true);
				}
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
