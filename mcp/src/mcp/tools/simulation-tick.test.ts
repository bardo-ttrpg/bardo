import { describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../domain/events/store";
import { parseMarkdown, renderMarkdown } from "../../domain/markdown/markdown";
import { readTextIfExists } from "../../infra/filesystem/filesystem";
import {
	renderPrometheusMetrics,
	resetTelemetryForTests,
} from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import { registerSimulationTickTool } from "./simulation-tick";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type SimulationTickHandler = (args: {
	mode?: "turn" | "scheduled";
	tickCount?: number;
	idempotencyKey?: string;
	dryRun?: boolean;
}) => ToolResult<{
	success: boolean;
	message?: string;
	idempotentReplay: boolean;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureSimulationTickHandler(args: {
	auth: AuthContext;
}): SimulationTickHandler {
	let handler: SimulationTickHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: SimulationTickHandler,
		): void => {
			if (name === "simulation_tick") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerSimulationTickTool(server, args.auth);
	if (!handler) {
		throw new Error("Failed to register simulation_tick.");
	}
	return handler;
}

describe("simulation_tick tool", () => {
	test("appends canonical event and refreshes projection", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-sim-tick-"));
		const bardoRoot = path.join(root, "bardo");
		const simulationTick = captureSimulationTickHandler({
			auth: createAuth(root),
		});

		const result = await simulationTick({
			mode: "turn",
			tickCount: 1,
			idempotencyKey: "simulation_tick_key_12345",
			dryRun: false,
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(
			events.some((event) => event.type === "simulation_tick_applied"),
		).toBe(true);
		const projectionRaw = await readFile(
			path.join(bardoRoot, "projections/current-state.md"),
			"utf8",
		);
		const projectionState = JSON.parse(
			parseMarkdown(projectionRaw).content,
		) as {
			lastAction: string;
		};
		expect(projectionState.lastAction).toBe("simulation_tick:turn");
		const legacyState = await readTextIfExists(
			path.join(bardoRoot, "state/current.md"),
		);
		expect(legacyState).toBeNull();
		let legacyEventFiles = 0;
		try {
			const files = await readdir(path.join(bardoRoot, "world/events"));
			legacyEventFiles = files.filter((file) =>
				file.toLowerCase().endsWith(".md"),
			).length;
		} catch {
			legacyEventFiles = 0;
		}
		expect(legacyEventFiles).toBe(0);

		await rm(root, { recursive: true, force: true });
	});

	test("blocks simulation tick when runtime policy boundary is violated", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-sim-tick-policy-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "manifests"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "manifests/table-contract.json"),
			JSON.stringify(
				{
					boundaries: {
						lines: ["simulation_tick"],
						veils: [],
					},
				},
				null,
				2,
			),
			"utf8",
		);
		const simulationTick = captureSimulationTickHandler({
			auth: createAuth(root),
		});

		const result = await simulationTick({
			mode: "scheduled",
			tickCount: 1,
			idempotencyKey: "simulation_tick_policy_key_12345",
			dryRun: false,
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
			path.join(os.tmpdir(), "bardo-sim-tick-strict-legacy-"),
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
		const simulationTick = captureSimulationTickHandler({
			auth: createAuth(root),
		});

		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		try {
			const result = await simulationTick({
				mode: "scheduled",
				tickCount: 1,
				idempotencyKey: "simulation_tick_strict_legacy_key_12345",
				dryRun: false,
			});
			expect(result.isError).toBe(true);
			expect(result.structuredContent.success).toBe(false);
			expect(result.structuredContent.message).toContain(
				"STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED",
			);
			const events = await readCanonicalEvents({ bardoRoot });
			expect(events.length).toBe(0);
			expect(renderPrometheusMetrics()).toContain(
				'bardo_legacy_fallback_reads_total{consumer="simulation_tick",outcome="blocked",strictmode="true"} 1',
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
