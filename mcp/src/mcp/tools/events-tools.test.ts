import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../domain/events/store";
import type { AuthContext } from "../../types/contracts";
import { registerAppendEventTool } from "./append-event";
import { registerReplayEventsTool } from "./replay-events";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type AppendEventHandler = (args: {
	id?: string;
	type: string;
	atISO?: string;
	source?: string;
	data?: Record<string, unknown>;
	dryRun?: boolean;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	idempotentReplay: boolean;
	event: { id: string; sequence: number; type: string } | null;
}>;

type ReplayEventsHandler = (args: {
	fromSequence?: number;
	limit?: number;
}) => ToolResult<{
	success: boolean;
	totalEvents: number;
	returnedEvents: number;
	events: Array<{ type: string }>;
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureHandlers(args: { auth: AuthContext }): {
	appendEvent: AppendEventHandler;
	replayEvents: ReplayEventsHandler;
} {
	let appendEvent: AppendEventHandler | null = null;
	let replayEvents: ReplayEventsHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: AppendEventHandler | ReplayEventsHandler,
		): void => {
			if (name === "append_event") {
				appendEvent = callback as AppendEventHandler;
			}
			if (name === "replay_events") {
				replayEvents = callback as ReplayEventsHandler;
			}
		},
	} as unknown as McpServer;

	registerAppendEventTool(server, args.auth);
	registerReplayEventsTool(server, args.auth);

	if (!appendEvent || !replayEvents) {
		throw new Error("Failed to register event tools.");
	}

	return { appendEvent, replayEvents };
}

describe("event MCP tools", () => {
	test("append_event writes canonical events and honors idempotency", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-append-event-"));
		const auth = createAuth(root);
		const { appendEvent } = captureHandlers({ auth });

		const first = await appendEvent({
			type: "scene_started",
			source: "test",
			data: { sceneId: "s-1" },
			idempotencyKey: "append_event_key_12345",
		});
		const second = await appendEvent({
			type: "scene_started",
			source: "test",
			data: { sceneId: "s-1" },
			idempotencyKey: "append_event_key_12345",
		});

		expect(first.isError).toBe(false);
		expect(first.structuredContent.success).toBe(true);
		expect(first.structuredContent.idempotentReplay).toBe(false);
		expect(first.structuredContent.event?.sequence).toBe(1);

		expect(second.isError).toBe(false);
		expect(second.structuredContent.success).toBe(true);
		expect(second.structuredContent.idempotentReplay).toBe(true);

		const events = await readCanonicalEvents({
			bardoRoot: path.join(root, "bardo"),
		});
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("scene_started");

		await rm(root, { recursive: true, force: true });
	});

	test("replay_events returns stored canonical events", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-replay-event-"));
		const auth = createAuth(root);
		const { appendEvent, replayEvents } = captureHandlers({ auth });

		await appendEvent({
			type: "scene_started",
			source: "test",
			data: {},
			idempotencyKey: "append_event_key_AAAAA",
		});
		await appendEvent({
			type: "player_action_declared",
			source: "test",
			data: {},
			idempotencyKey: "append_event_key_BBBBB",
		});

		const replay = await replayEvents({
			fromSequence: 1,
			limit: 10,
		});

		expect(replay.isError).toBe(false);
		expect(replay.structuredContent.success).toBe(true);
		expect(replay.structuredContent.totalEvents).toBe(2);
		expect(replay.structuredContent.returnedEvents).toBe(2);
		expect(replay.structuredContent.events[0]?.type).toBe("scene_started");
		expect(replay.structuredContent.events[1]?.type).toBe(
			"player_action_declared",
		);

		await rm(root, { recursive: true, force: true });
	});

	test("append_event blocks policy-violating content", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-append-event-policy-"),
		);
		const auth = createAuth(root);
		const { appendEvent } = captureHandlers({ auth });

		const blocked = await appendEvent({
			type: "lore_revealed",
			source: "test",
			data: {
				action: "The narration describes sexual violence directly.",
			},
			idempotencyKey: "append_event_policy_key_12345",
		});
		expect(blocked.isError).toBe(true);
		expect(blocked.structuredContent.success).toBe(false);

		const events = await readCanonicalEvents({
			bardoRoot: path.join(root, "bardo"),
		});
		expect(events.length).toBe(0);

		await rm(root, { recursive: true, force: true });
	});
});
