import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import { migrateLegacyStateToCanonicalEvents } from "../../domain/migrations/legacy-state";
import { resolveBardoRoot } from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const migrateLegacyStateInputSchema = z.object({
	dryRun: z
		.boolean()
		.default(false)
		.describe("Preview migration without mutating canonical state."),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Required when dryRun is false."),
});

const migrateLegacyStateOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	dryRun: z.boolean(),
	idempotentReplay: z.boolean(),
	migrated: z.boolean(),
	canonicalEventsBefore: z.number().int().nonnegative(),
	canonicalEventsAfter: z.number().int().nonnegative(),
	migrationEventId: z.union([z.string(), z.null()]),
	manifestPath: z.union([z.string(), z.null()]),
	projectionPaths: z.array(z.string()),
	reason: z.string(),
	report: z.object({
		status: z.enum(["migrated", "skipped", "dry_run"]),
		warnings: z.array(z.string()),
		errors: z.array(z.string()),
		inferredFields: z.array(z.string()),
		skippedFields: z.array(z.string()),
	}),
});

type MigrateLegacyStateOutput = z.infer<typeof migrateLegacyStateOutputSchema>;

export function registerMigrateLegacyStateTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"migrate_legacy_state",
		{
			title: "Migrate Legacy State",
			description:
				"Migrate legacy state/current.md snapshot into append-only canonical events and refresh projections.",
			inputSchema: migrateLegacyStateInputSchema,
			outputSchema: migrateLegacyStateOutputSchema,
			annotations: {
				title: "Migrate Legacy State",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ dryRun, idempotencyKey }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			try {
				if (!dryRun && !idempotencyKey) {
					throw new Error("`idempotencyKey` is required when dryRun is false.");
				}

				if (!dryRun && idempotencyKey) {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "migrate_legacy_state",
					});
					if (replay) {
						return makeToolResult({
							...(replay as MigrateLegacyStateOutput),
							idempotentReplay: true,
						});
					}
				}

				const migration = await migrateLegacyStateToCanonicalEvents({
					bardoRoot,
					nowIso: new Date().toISOString(),
					dryRun,
					idempotencyKey,
				});
				const output: MigrateLegacyStateOutput = {
					success: true,
					message: migration.reason,
					rootPath: bardoRoot,
					dryRun,
					idempotentReplay: false,
					migrated: migration.migrated,
					canonicalEventsBefore: migration.canonicalEventsBefore,
					canonicalEventsAfter: migration.canonicalEventsAfter,
					migrationEventId: migration.migrationEventId,
					manifestPath: migration.manifestPath,
					projectionPaths: migration.projectionPaths,
					reason: migration.reason,
					report: migration.report,
				};

				if (!dryRun && idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope: "migrate_legacy_state",
						result: output,
						nowIso: new Date().toISOString(),
					});
				}

				return makeToolResult(output);
			} catch (error) {
				const output: MigrateLegacyStateOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to migrate legacy state: ${error.message}`
							: "Failed to migrate legacy state.",
					rootPath: bardoRoot,
					dryRun,
					idempotentReplay: false,
					migrated: false,
					canonicalEventsBefore: 0,
					canonicalEventsAfter: 0,
					migrationEventId: null,
					manifestPath: null,
					projectionPaths: [],
					reason: "Migration failed.",
					report: {
						status: "skipped",
						warnings: [],
						errors: [
							error instanceof Error
								? error.message
								: "Unknown migration failure.",
						],
						inferredFields: [],
						skippedFields: [],
					},
				};
				return makeToolResult(output, true);
			}
		},
	);
}
