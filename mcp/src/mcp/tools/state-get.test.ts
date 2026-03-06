import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { registerStateGetTool } from "./state-get";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type StateGetHandler = (args: { path?: string }) => ToolResult<{
	success: boolean;
	stateSource:
		| "projection"
		| "legacy_state"
		| "explicit_path"
		| "empty_default"
		| "strict_blocked_legacy"
		| "strict_stale_projection";
	state: { currentLocation?: string };
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureStateGetHandler(args: { auth: AuthContext }): StateGetHandler {
	let handler: StateGetHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: StateGetHandler,
		): void => {
			if (name === "state_get") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerStateGetTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register state_get.");
	}
	return handler;
}

describe("state_get tool", () => {
	test("prefers projection current-state when path is omitted", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-state-get-proj-"));
		const bardoRoot = path.join(root, "bardo");
		const projectionPath = path.join(bardoRoot, "projections/current-state.md");
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "false";
		try {
			await mkdir(path.dirname(projectionPath), { recursive: true });
			await Bun.write(
				projectionPath,
				renderMarkdown(
					{
						title: "Current State Projection",
						description: "Derived state",
					},
					JSON.stringify(
						{
							currentLocation: "projection-town",
						},
						null,
						2,
					),
				),
			);
			const handler = captureStateGetHandler({ auth: createAuth(root) });

			const result = await handler({});
			expect(result.isError).toBe(false);
			expect(result.structuredContent.success).toBe(true);
			expect(result.structuredContent.stateSource).toBe("projection");
			expect(result.structuredContent.state.currentLocation).toBe(
				"projection-town",
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("falls back to legacy state file when projection is missing", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		resetTelemetryForTests();
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-get-legacy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const legacyPath = path.join(bardoRoot, "state/current.md");
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "false";
		try {
			await mkdir(path.dirname(legacyPath), { recursive: true });
			await Bun.write(
				legacyPath,
				renderMarkdown(
					{
						title: "Campaign State",
						description: "Legacy state",
					},
					JSON.stringify(
						{
							currentLocation: "legacy-town",
						},
						null,
						2,
					),
				),
			);
			const handler = captureStateGetHandler({ auth: createAuth(root) });

			const result = await handler({});
			expect(result.isError).toBe(false);
			expect(result.structuredContent.success).toBe(true);
			expect(result.structuredContent.stateSource).toBe("legacy_state");
			expect(result.structuredContent.state.currentLocation).toBe(
				"legacy-town",
			);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="state_get",outcome="used",strictmode="false"} 1',
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("reads explicit markdown path unchanged", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-get-explicit-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const explicitPath = path.join(bardoRoot, "state/custom.md");
		await mkdir(path.dirname(explicitPath), { recursive: true });
		await writeFile(
			explicitPath,
			renderMarkdown(
				{ title: "Custom State", description: "Explicit read path" },
				JSON.stringify({ currentLocation: "custom-town" }, null, 2),
			),
			"utf8",
		);
		const handler = captureStateGetHandler({ auth: createAuth(root) });

		const result = await handler({ path: "state/custom.md" });
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.stateSource).toBe("explicit_path");
		expect(result.structuredContent.state.currentLocation).toBe("custom-town");
		const parsed = parseMarkdown(
			await Bun.file(path.join(bardoRoot, "state/custom.md")).text(),
		);
		expect(parsed.frontmatter.title).toBe("Custom State");

		await rm(root, { recursive: true, force: true });
	});

	test("blocks legacy fallback when strict canonical mode is enabled", async () => {
		resetTelemetryForTests();
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-get-strict-legacy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const legacyPath = path.join(bardoRoot, "state/current.md");
		await mkdir(path.dirname(legacyPath), { recursive: true });
		await Bun.write(
			legacyPath,
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state",
				},
				JSON.stringify(
					{
						currentLocation: "legacy-town",
					},
					null,
					2,
				),
			),
		);
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const handler = captureStateGetHandler({ auth: createAuth(root) });
			const result = await handler({});
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
			expect(result.structuredContent.stateSource).toBe(
				"strict_blocked_legacy",
			);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="state_get",outcome="blocked",strictmode="true"} 1',
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});

	test("auto-recovers stale projection when strict canonical mode is enabled", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-state-get-strict-stale-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const projectionPath = path.join(bardoRoot, "projections/current-state.md");
		await mkdir(path.dirname(projectionPath), { recursive: true });
		await Bun.write(
			projectionPath,
			renderMarkdown(
				{
					title: "Current State Projection",
					description: "Derived state",
					projection_schema: "v1",
					source_event_seq_min: "1",
					source_event_seq_max: "0",
					source_event_count: "0",
					generated_at_iso: "2026-02-23T00:00:00.000Z",
				},
				JSON.stringify(
					{
						currentLocation: "projection-town",
					},
					null,
					2,
				),
			),
		);
		const eventsPath = path.join(bardoRoot, "events/canonical.ndjson");
		await mkdir(path.dirname(eventsPath), { recursive: true });
		await Bun.write(
			eventsPath,
			`${JSON.stringify({
				sequence: 1,
				id: "evt-strict-stale-1",
				type: "player_action_resolved",
				atISO: "2026-02-23T00:10:00.000Z",
				source: "test",
				data: {
					action: "I travel to river-market",
					worldTimeAfterISO: "2026-02-23T00:10:00.000Z",
					locationAfter: "river-market",
					createdLocationIds: ["river-market"],
					createdNpcIds: [],
				},
			})}\n`,
		);
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const handler = captureStateGetHandler({ auth: createAuth(root) });
			const result = await handler({});
			expect(result.isError).toBe(false);
			expect(result.structuredContent.success).toBe(true);
			expect(result.structuredContent.stateSource).toBe("projection");
			expect(result.structuredContent.state.currentLocation).toBe(
				"river-market",
			);
		} finally {
			if (previousStrict === undefined) {
				delete Bun.env.BARDO_STRICT_CANONICAL_MODE;
			} else {
				Bun.env.BARDO_STRICT_CANONICAL_MODE = previousStrict;
			}
			await rm(root, { recursive: true, force: true });
		}
	});
});
