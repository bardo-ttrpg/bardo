import { readdir } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { parseMarkdown } from "../../domain/markdown/markdown";
import {
	readTextIfExists,
	resolveBardoRoot,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const recordCrudInputSchema = z.object({
	op: z
		.enum(["create", "update", "delete", "get", "list"])
		.describe("CRUD operation to execute"),
	id: z
		.string()
		.trim()
		.min(1)
		.max(120)
		.optional()
		.describe("Record ID/slug for create/update/delete/get"),
	name: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.optional()
		.describe("Optional display name/title for create/update"),
	data: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Structured record payload"),
	limit: z.number().int().min(1).max(100).optional(),
	dryRun: z.boolean().default(false),
	idempotencyKey: z
		.string()
		.trim()
		.min(8)
		.max(256)
		.optional()
		.describe("Deprecated for this tool; ignored for non-mutating operations."),
});

const recordCrudOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	kind: z.enum(["entity", "location", "faction", "event"]),
	op: z.enum(["create", "update", "delete", "get", "list"]),
	id: z.string().nullable(),
	path: z.string().nullable(),
	dryRun: z.boolean(),
	idempotentReplay: z.boolean(),
	record: z.record(z.string(), z.unknown()).nullable(),
	records: z.array(
		z.object({
			id: z.string(),
			path: z.string(),
			title: z.string(),
		}),
	),
});

type RecordKind = "entity" | "location" | "faction" | "event";
type RecordCrudOutput = z.infer<typeof recordCrudOutputSchema>;

function directoryForKind(kind: RecordKind): string {
	switch (kind) {
		case "entity":
			return "entities";
		case "location":
			return "world/locations";
		case "faction":
			return "world/factions";
		case "event":
			return "world/events";
	}
}

async function listRecords(args: {
	bardoRoot: string;
	directory: string;
	limit: number;
}): Promise<Array<{ id: string; path: string; title: string }>> {
	const dirPath = resolvePathInsideRoot(args.bardoRoot, args.directory);
	try {
		const entries = await readdir(dirPath, { withFileTypes: true });
		const records: Array<{ id: string; path: string; title: string }> = [];
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
				continue;
			}
			const id = entry.name.replace(/\.md$/i, "");
			const filePath = resolvePathInsideRoot(
				args.bardoRoot,
				`${args.directory}/${entry.name}`,
			);
			const raw = await readTextIfExists(filePath);
			if (!raw) {
				continue;
			}
			const parsed = parseMarkdown(raw);
			records.push({
				id,
				path: filePath,
				title: parsed.frontmatter.title?.trim() || id,
			});
			if (records.length >= args.limit) {
				break;
			}
		}
		return records;
	} catch {
		return [];
	}
}

function assertAllowedOperation(args: {
	kind: RecordKind;
	op: "create" | "update" | "delete" | "get" | "list";
}): void {
	if (args.op === "get" || args.op === "list") {
		return;
	}

	if (args.kind === "event") {
		throw new Error(
			"Canonical events are append-only. Use `append_event` for canonical event writes.",
		);
	}

	throw new Error(
		"Direct canonical record mutations are disabled. Use `apply_domain_transition` for append-only entity/location/faction transitions.",
	);
}

function registerRecordCrudTool(args: {
	server: McpServer;
	auth: AuthContext;
	kind: RecordKind;
	toolName: "entity_crud" | "location_crud" | "faction_crud" | "event_crud";
	title: string;
	description: string;
}): void {
	args.server.registerTool(
		args.toolName,
		{
			title: args.title,
			description: args.description,
			inputSchema: recordCrudInputSchema,
			outputSchema: recordCrudOutputSchema,
			annotations: {
				title: args.title,
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ op, id, limit, dryRun }) => {
			const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
			const directory = directoryForKind(args.kind);
			const resolvedLimit = limit ?? 25;

			try {
				assertAllowedOperation({ kind: args.kind, op });

				if (op === "list") {
					const records = await listRecords({
						bardoRoot,
						directory,
						limit: resolvedLimit,
					});
					const output: RecordCrudOutput = {
						success: true,
						message: records.length
							? `${args.kind} records listed successfully.`
							: `No ${args.kind} records found.`,
						kind: args.kind,
						op,
						id: null,
						path: null,
						dryRun,
						idempotentReplay: false,
						record: null,
						records,
					};
					return makeToolResult(output);
				}

				const normalizedId = id?.trim() || null;
				if (!normalizedId) {
					throw new Error("`id` is required for this operation.");
				}
				const filePath = resolvePathInsideRoot(
					bardoRoot,
					`${directory}/${normalizedId}.md`,
				);

				const raw = await readTextIfExists(filePath);
				if (!raw) {
					const output: RecordCrudOutput = {
						success: false,
						message: `${args.kind} record not found.`,
						kind: args.kind,
						op,
						id: normalizedId,
						path: filePath,
						dryRun,
						idempotentReplay: false,
						record: null,
						records: [],
					};
					return makeToolResult(output, true);
				}

				const parsed = parseMarkdown(raw);
				let record: Record<string, unknown> | null = null;
				try {
					record = parsed.content.trim()
						? (JSON.parse(parsed.content) as Record<string, unknown>)
						: {};
				} catch {
					record = {
						_body: parsed.content,
					};
				}

				const output: RecordCrudOutput = {
					success: true,
					message: `${args.kind} record read successfully.`,
					kind: args.kind,
					op,
					id: normalizedId,
					path: filePath,
					dryRun,
					idempotentReplay: false,
					record,
					records: [],
				};
				return makeToolResult(output);
			} catch (error) {
				const output: RecordCrudOutput = {
					success: false,
					message:
						error instanceof Error
							? `Failed to process ${args.kind} CRUD: ${error.message}`
							: `Failed to process ${args.kind} CRUD.`,
					kind: args.kind,
					op,
					id: id ?? null,
					path: null,
					dryRun,
					idempotentReplay: false,
					record: null,
					records: [],
				};
				return makeToolResult(output, true);
			}
		},
	);
}

export function registerEntityCrudTool(
	server: McpServer,
	auth: AuthContext,
): void {
	registerRecordCrudTool({
		server,
		auth,
		kind: "entity",
		toolName: "entity_crud",
		title: "Entity Records",
		description:
			"Read/list entity records in canonical workspace. Mutations are append-only via apply_domain_transition.",
	});
}

export function registerLocationCrudTool(
	server: McpServer,
	auth: AuthContext,
): void {
	registerRecordCrudTool({
		server,
		auth,
		kind: "location",
		toolName: "location_crud",
		title: "Location Records",
		description:
			"Read/list location records in canonical workspace. Mutations are append-only via apply_domain_transition.",
	});
}

export function registerFactionCrudTool(
	server: McpServer,
	auth: AuthContext,
): void {
	registerRecordCrudTool({
		server,
		auth,
		kind: "faction",
		toolName: "faction_crud",
		title: "Faction Records",
		description:
			"Read/list faction records in canonical workspace. Mutations are append-only via apply_domain_transition.",
	});
}

export function registerEventCrudTool(
	server: McpServer,
	auth: AuthContext,
): void {
	registerRecordCrudTool({
		server,
		auth,
		kind: "event",
		toolName: "event_crud",
		title: "Event Records",
		description:
			"Read/list legacy world event markdown records. Canonical event writes are append-only via append_event.",
	});
}
