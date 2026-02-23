import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../domain/events/store";
import { renderMarkdown } from "../../domain/markdown/markdown";
import type { AuthContext } from "../../types/contracts";
import { registerMigrateLegacyStateTool } from "./migrate-legacy-state";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type MigrateLegacyStateHandler = (args: {
	dryRun?: boolean;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	migrated: boolean;
	idempotentReplay: boolean;
	canonicalEventsBefore: number;
	canonicalEventsAfter: number;
	report: {
		status: "migrated" | "skipped" | "dry_run";
		warnings: string[];
		errors: string[];
		inferredFields: string[];
		skippedFields: string[];
	};
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureMigrateLegacyStateHandler(args: {
	auth: AuthContext;
}): MigrateLegacyStateHandler {
	let handler: MigrateLegacyStateHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: MigrateLegacyStateHandler,
		): void => {
			if (name === "migrate_legacy_state") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerMigrateLegacyStateTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register migrate_legacy_state.");
	}
	return handler;
}

describe("migrate_legacy_state tool", () => {
	test("dry-run is non-destructive and reports projected append", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-migrate-legacy-dry-run-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const statePath = path.join(bardoRoot, "state/current.md");
		await mkdir(path.dirname(statePath), { recursive: true });
		await writeFile(
			statePath,
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Current campaign state",
				},
				JSON.stringify(
					{
						worldTimeISO: "2026-02-23T06:00:00.000Z",
						currentLocation: "river-market",
						counters: { unknownNpc: 0, unknownLocation: 0 },
						locations: {},
						lastAction: "legacy-action",
					},
					null,
					2,
				),
			),
			"utf8",
		);
		const migrate = captureMigrateLegacyStateHandler({
			auth: createAuth(root),
		});

		const result = await migrate({
			dryRun: true,
			idempotencyKey: "migrate_legacy_dry_run_key_12345",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.report.status).toBe("dry_run");
		expect(result.structuredContent.canonicalEventsBefore).toBe(0);
		expect(result.structuredContent.canonicalEventsAfter).toBe(1);
		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(0);
		const manifestExists = await Bun.file(
			path.join(bardoRoot, "manifests/schema-version.json"),
		).exists();
		expect(manifestExists).toBe(false);

		await rm(root, { recursive: true, force: true });
	});

	test("migrates legacy state snapshot into canonical event and schema manifest", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-migrate-legacy-"));
		const bardoRoot = path.join(root, "bardo");
		const statePath = path.join(bardoRoot, "state/current.md");
		await mkdir(path.dirname(statePath), { recursive: true });
		await writeFile(
			statePath,
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Current campaign state",
				},
				JSON.stringify(
					{
						worldTimeISO: "2026-02-23T07:00:00.000Z",
						currentLocation: "river-market",
						counters: {
							unknownNpc: 1,
							unknownLocation: 0,
						},
						locations: {
							"river-market": {
								name: "River Market",
								visits: 2,
								npcIds: ["unknown_npc_01"],
							},
						},
						lastAction: "legacy-action",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const migrate = captureMigrateLegacyStateHandler({
			auth: createAuth(root),
		});
		const result = await migrate({
			idempotencyKey: "migrate_legacy_key_12345",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.migrated).toBe(true);
		expect(result.structuredContent.canonicalEventsAfter).toBe(1);
		expect(result.structuredContent.report.status).toBe("migrated");
		expect(result.structuredContent.report.errors.length).toBe(0);
		expect(result.structuredContent.report.warnings.length).toBe(0);
		expect(
			result.structuredContent.report.inferredFields.length,
		).toBeGreaterThan(0);
		expect(result.structuredContent.report.skippedFields.length).toBe(0);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events[0]?.type).toBe("legacy_state_migrated");
		const manifestRaw = await readFile(
			path.join(bardoRoot, "manifests/schema-version.json"),
			"utf8",
		);
		expect(manifestRaw).toContain("legacy_state_migrated");

		await rm(root, { recursive: true, force: true });
	});

	test("returns idempotent replay for repeated migration key", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-migrate-legacy-"));
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Current campaign state",
				},
				JSON.stringify(
					{
						worldTimeISO: "2026-02-23T08:00:00.000Z",
						currentLocation: "starting-area",
						counters: { unknownNpc: 0, unknownLocation: 0 },
						locations: {},
						lastAction: "legacy-action",
					},
					null,
					2,
				),
			),
			"utf8",
		);

		const migrate = captureMigrateLegacyStateHandler({
			auth: createAuth(root),
		});
		const first = await migrate({
			idempotencyKey: "migrate_legacy_key_replay",
		});
		const second = await migrate({
			idempotencyKey: "migrate_legacy_key_replay",
		});

		expect(first.structuredContent.idempotentReplay).toBe(false);
		expect(second.structuredContent.idempotentReplay).toBe(true);
		expect(second.structuredContent.canonicalEventsAfter).toBe(
			first.structuredContent.canonicalEventsAfter,
		);
		expect(second.structuredContent.report.status).toBe("migrated");
		expect(second.structuredContent.report.errors.length).toBe(0);
		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);

		await rm(root, { recursive: true, force: true });
	});

	test("records warnings when legacy state JSON is malformed", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-migrate-legacy-malformed-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Malformed legacy state snapshot",
				},
				"{invalid-json",
			),
			"utf8",
		);

		const migrate = captureMigrateLegacyStateHandler({
			auth: createAuth(root),
		});
		const result = await migrate({
			idempotencyKey: "migrate_legacy_malformed_key_12345",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.migrated).toBe(true);
		expect(result.structuredContent.report.status).toBe("migrated");
		expect(result.structuredContent.report.warnings.length).toBeGreaterThan(0);
		expect(
			result.structuredContent.report.warnings.some((warning) =>
				warning.includes("malformed"),
			),
		).toBe(true);
		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("legacy_state_migrated");

		await rm(root, { recursive: true, force: true });
	});
});
