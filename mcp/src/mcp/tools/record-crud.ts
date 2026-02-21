import { readdir, rm, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
	getIdempotentResult,
	setIdempotentResult,
} from "../../domain/idempotency/store";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
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
		.describe("Required for mutating non-dry-run operations"),
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

function titleFor(
	kind: RecordKind,
	id: string,
	name: string | undefined,
): string {
	return (
		name?.trim() || `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)} ${id}`
	);
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

function assertMutationIdempotency(args: {
	op: "create" | "update" | "delete" | "get" | "list";
	dryRun: boolean;
	idempotencyKey: string | undefined;
}): void {
	if (args.dryRun) {
		return;
	}
	if (args.op === "get" || args.op === "list") {
		return;
	}
	if (!args.idempotencyKey) {
		throw new Error(
			"`idempotencyKey` is required for mutating operations when dryRun is false.",
		);
	}
}

function normalizeRecordPayload(args: {
	id: string;
	name: string | undefined;
	data: Record<string, unknown> | undefined;
}): Record<string, unknown> {
	const base = args.data ? { ...args.data } : {};
	return {
		id: args.id,
		name: args.name ?? base.name ?? args.id,
		...base,
	};
}

function scopeFor(kind: RecordKind): string {
	return `${kind}_crud`;
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
		async ({ op, id, name, data, limit, dryRun, idempotencyKey }) => {
			const bardoRoot = resolveBardoRoot(args.auth.campaignBasePath);
			const directory = directoryForKind(args.kind);
			const scope = scopeFor(args.kind);
			const resolvedLimit = limit ?? 25;

			try {
				assertMutationIdempotency({ op, dryRun, idempotencyKey });

				if (!dryRun && idempotencyKey && op !== "get" && op !== "list") {
					const replay = await getIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope,
					});
					if (replay) {
						return makeToolResult({
							...(replay as RecordCrudOutput),
							idempotentReplay: true,
						});
					}
				}

				const normalizedId = id?.trim() || null;
				let filePath: string | null = null;
				if (normalizedId) {
					filePath = resolvePathInsideRoot(
						bardoRoot,
						`${directory}/${normalizedId}.md`,
					);
				}

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

				if (!filePath || !normalizedId) {
					throw new Error("`id` is required for this operation.");
				}

				if (op === "get") {
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
				}

				if (op === "delete") {
					if (!dryRun) {
						await rm(filePath, { force: true });
					}
					const output: RecordCrudOutput = {
						success: true,
						message: dryRun
							? `${args.kind} delete dry-run completed.`
							: `${args.kind} deleted successfully.`,
						kind: args.kind,
						op,
						id: normalizedId,
						path: filePath,
						dryRun,
						idempotentReplay: false,
						record: null,
						records: [],
					};
					if (!dryRun && idempotencyKey) {
						await setIdempotentResult({
							bardoRoot,
							key: idempotencyKey,
							scope,
							result: output,
							nowIso: new Date().toISOString(),
						});
					}
					return makeToolResult(output);
				}

				const existing = await readTextIfExists(filePath);
				if (op === "create" && existing !== null) {
					throw new Error(`${args.kind} record already exists.`);
				}
				if (op === "update" && existing === null) {
					throw new Error(`${args.kind} record does not exist.`);
				}

				const payload = normalizeRecordPayload({
					id: normalizedId,
					name,
					data,
				});
				const frontmatterTitle = titleFor(args.kind, normalizedId, name);
				if (!dryRun) {
					await ensureParentDirectoryExists(filePath);
					await writeFile(
						filePath,
						renderMarkdown(
							{
								description: `${args.kind} record`,
								title: frontmatterTitle,
							},
							JSON.stringify(payload, null, 2),
						),
						"utf8",
					);
				}

				const output: RecordCrudOutput = {
					success: true,
					message: dryRun
						? `${args.kind} ${op} dry-run completed.`
						: `${args.kind} ${op} completed successfully.`,
					kind: args.kind,
					op,
					id: normalizedId,
					path: filePath,
					dryRun,
					idempotentReplay: false,
					record: payload,
					records: [],
				};
				if (!dryRun && idempotencyKey) {
					await setIdempotentResult({
						bardoRoot,
						key: idempotencyKey,
						scope,
						result: output,
						nowIso: new Date().toISOString(),
					});
				}
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
		title: "Entity CRUD",
		description:
			"Create, read, update, delete, and list entity records in the canonical workspace.",
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
		title: "Location CRUD",
		description:
			"Create, read, update, delete, and list location records in canonical world storage.",
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
		title: "Faction CRUD",
		description:
			"Create, read, update, delete, and list faction records for autonomous world simulation.",
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
		title: "Event CRUD",
		description:
			"Create, read, update, delete, and list timeline event records for persistent causality.",
	});
}
