import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	appendCanonicalEvent,
	readCanonicalEvents,
} from "../../domain/events/store";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import {
	evaluateRuntimePolicy,
	loadAuthorityPolicy,
	loadTableContract,
	summarizeRuntimePolicyViolations,
} from "../../domain/policy/runtime-guards";
import { regenerateProjectionsForEventTypes } from "../../domain/projections/refresh";
import { withKeyedLock } from "../../infra/concurrency/keyed-lock";
import {
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const appendEventInputSchema = z.object({
	id: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.optional()
		.describe("Optional event id. If omitted, one is generated."),
	type: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.describe("Typed canonical event name (for example `scene_started`)."),
	atISO: z
		.string()
		.optional()
		.describe("Event timestamp in ISO format. Defaults to now."),
	source: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.default("append_event")
		.describe("Tool or subsystem that produced this event."),
	data: z
		.record(z.string(), z.unknown())
		.default({})
		.describe("Structured event payload."),
	dryRun: z
		.boolean()
		.default(false)
		.describe("Validate and preview append without writing."),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Required when dryRun is false."),
});

const appendEventOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	rootPath: z.string(),
	eventLogPath: z.string(),
	dryRun: z.boolean(),
	idempotentReplay: z.boolean(),
	event: z
		.object({
			id: z.string(),
			sequence: z.number().int().positive(),
			type: z.string(),
			atISO: z.string(),
			source: z.string(),
			data: z.record(z.string(), z.unknown()),
		})
		.nullable(),
});

type AppendEventOutput = z.infer<typeof appendEventOutputSchema>;

function parseEventTimestamp(atISO: string | undefined): string {
	if (!atISO) {
		return new Date().toISOString();
	}
	const parsed = new Date(atISO);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("`atISO` must be a valid ISO timestamp.");
	}
	return parsed.toISOString();
}

function policyTextForAppendEvent(args: {
	type: string;
	source: string;
	data: Record<string, unknown>;
}): string {
	const action = typeof args.data.action === "string" ? args.data.action : "";
	const summary =
		typeof args.data.summary === "string" ? args.data.summary : "";
	const transcript =
		typeof args.data.transcript === "string" ? args.data.transcript : "";
	return [args.type, args.source, action, summary, transcript]
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.join(" ");
}

export function registerAppendEventTool(
	server: McpServer,
	auth: AuthContext,
): void {
	server.registerTool(
		"append_event",
		{
			title: "Append Canonical Event",
			description:
				"Append a typed event to the canonical append-only event log used for replay and projections.",
			inputSchema: appendEventInputSchema,
			outputSchema: appendEventOutputSchema,
			annotations: {
				title: "Append Canonical Event",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ id, type, atISO, source, data, dryRun, idempotencyKey }) => {
			const bardoRoot = resolveBardoRoot(auth.campaignBasePath);
			const eventLogPath = resolvePathInsideRoot(
				bardoRoot,
				"events/canonical.ndjson",
			);
			try {
				return await withKeyedLock(
					`workspace-mutation:${bardoRoot}`,
					async () => {
						if (!dryRun && !idempotencyKey) {
							throw new Error(
								"`idempotencyKey` is required when dryRun is false.",
							);
						}
						if (!dryRun && idempotencyKey) {
							const replay = await getIdempotentResult({
								bardoRoot,
								key: idempotencyKey,
								scope: "append_event",
							});
							if (replay) {
								return makeToolResult({
									...(replay as AppendEventOutput),
									idempotentReplay: true,
								});
							}
						}
						const tableContract = await loadTableContract({ bardoRoot });
						const authorityPolicy = await loadAuthorityPolicy({ bardoRoot });
						const runtimeViolations = evaluateRuntimePolicy({
							action: policyTextForAppendEvent({ type, source, data }),
							tableContract,
							authorityPolicy,
						});
						if (runtimeViolations.length > 0) {
							throw new Error(
								`Runtime policy blocked append_event: ${summarizeRuntimePolicyViolations(runtimeViolations)}`,
							);
						}

						const eventId = id?.trim() || `evt-${crypto.randomUUID()}`;
						const normalizedTimestamp = parseEventTimestamp(atISO);
						const existingEvents = await readCanonicalEvents({ bardoRoot });
						const nextSequence = existingEvents.length + 1;

						if (dryRun) {
							const output: AppendEventOutput = {
								success: true,
								message: "Event append dry-run succeeded.",
								rootPath: bardoRoot,
								eventLogPath,
								dryRun: true,
								idempotentReplay: false,
								event: {
									id: eventId,
									sequence: nextSequence,
									type,
									atISO: normalizedTimestamp,
									source,
									data,
								},
							};
							return makeToolResult(output);
						}

						const appended = await appendCanonicalEvent({
							bardoRoot,
							event: {
								id: eventId,
								type,
								atISO: normalizedTimestamp,
								source,
								data,
							},
						});
						await regenerateProjectionsForEventTypes({
							bardoRoot,
							eventTypes: [type],
						});
						const output: AppendEventOutput = {
							success: true,
							message: "Event appended successfully.",
							rootPath: bardoRoot,
							eventLogPath,
							dryRun: false,
							idempotentReplay: false,
							event: appended,
						};
						if (idempotencyKey) {
							await setIdempotentResult({
								bardoRoot,
								key: idempotencyKey,
								scope: "append_event",
								result: output,
								nowIso: new Date().toISOString(),
							});
						}
						return makeToolResult(output);
					},
				);
			} catch (error) {
				const output: AppendEventOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to append event: ${error.message}`
							: "Failed to append event.",
					rootPath: bardoRoot,
					eventLogPath,
					dryRun,
					idempotentReplay: false,
					event: null,
				};
				return makeToolResult(output, true);
			}
		},
	);
}
