import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../../domain/events/store";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import { readTextIfExists } from "../../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../../telemetry";
import type { AuthContext } from "../../../types/contracts";
import { registerWorldSyncTool } from "./register";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type WorldSyncHandler = (args: {
	transcript: string;
	currentLocationHint?: string;
}) => ToolResult<{
	success: boolean;
	message?: string;
	currentLocationAfter: string;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureWorldSyncHandler(args: {
	auth: AuthContext;
}): WorldSyncHandler {
	let handler: WorldSyncHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: WorldSyncHandler,
		): void => {
			if (name === "world_sync") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerWorldSyncTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register world_sync.");
	}
	return handler;
}

describe("world_sync tool", () => {
	test("appends canonical world_sync event and refreshes projection", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-world-sync-"));
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			transcript: 'welcome to River Market. "I am Mira."',
		});
		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.currentLocationAfter).toBe("river-market");

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.some((event) => event.type === "world_sync_applied")).toBe(
			true,
		);
		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			currentLocation: string;
			lastAction: string;
		};
		expect(projectionState.currentLocation).toBe("river-market");
		expect(projectionState.lastAction).toBe("world_sync");
		const legacyState = await readTextIfExists(
			path.join(bardoRoot, "state/current.md"),
		);
		const legacyHistory = await readTextIfExists(
			path.join(bardoRoot, "state/history.md"),
		);
		expect(legacyState).toBeNull();
		expect(legacyHistory).toBeNull();

		await rm(root, { recursive: true, force: true });
	});

	test("blocks transcript that violates table contract boundary", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-policy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const result = await worldSync({
			transcript: "The scene includes sexual violence in detail.",
		});
		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("runtime_policy_blocked");

		await rm(root, { recursive: true, force: true });
	});

	test("blocks legacy fallback reads in strict canonical mode before mutations", async () => {
		resetTelemetryForTests();
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-world-sync-strict-legacy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "state"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "state/current.md"),
			renderMarkdown(
				{
					title: "Campaign State",
					description: "Legacy state",
				},
				JSON.stringify({ currentLocation: "legacy-town" }, null, 2),
			),
			"utf8",
		);
		const worldSync = captureWorldSyncHandler({ auth: createAuth(root) });

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const result = await worldSync({
				transcript: 'A new landmark is called "Old Bell Plaza."',
			});
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
			expect(result.structuredContent.message).toContain(
				"STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED",
			);
			const events = await readCanonicalEvents({ bardoRoot });
			expect(events.length).toBe(0);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="world_sync",outcome="blocked",strictmode="true"} 1',
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
