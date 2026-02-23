import { describe, expect, test } from "bun:test";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "../../types/contracts";
import {
	registerEntityCrudTool,
	registerEventCrudTool,
	registerFactionCrudTool,
	registerLocationCrudTool,
} from "./record-crud";

type ToolHandler = (args: Record<string, unknown>) => Promise<{
	isError: boolean;
	structuredContent: {
		success: boolean;
		message: string;
	};
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureEventCrudHandler(auth: AuthContext): ToolHandler {
	let handler: ToolHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ToolHandler,
		): void => {
			if (name === "event_crud") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerEventCrudTool(server, auth);
	if (!handler) {
		throw new Error("event_crud handler was not registered.");
	}
	return handler;
}

function captureEntityCrudHandler(auth: AuthContext): ToolHandler {
	let handler: ToolHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ToolHandler,
		): void => {
			if (name === "entity_crud") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerEntityCrudTool(server, auth);
	if (!handler) {
		throw new Error("entity_crud handler was not registered.");
	}
	return handler;
}

function captureLocationCrudHandler(auth: AuthContext): ToolHandler {
	let handler: ToolHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ToolHandler,
		): void => {
			if (name === "location_crud") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerLocationCrudTool(server, auth);
	if (!handler) {
		throw new Error("location_crud handler was not registered.");
	}
	return handler;
}

function captureFactionCrudHandler(auth: AuthContext): ToolHandler {
	let handler: ToolHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: ToolHandler,
		): void => {
			if (name === "faction_crud") {
				handler = callback;
			}
		},
	} as unknown as McpServer;

	registerFactionCrudTool(server, auth);
	if (!handler) {
		throw new Error("faction_crud handler was not registered.");
	}
	return handler;
}

describe("domain record_crud canonical restrictions", () => {
	test("rejects entity create and redirects to apply_domain_transition", async () => {
		const handler = captureEntityCrudHandler(
			createAuth("/tmp/bardo-entity-crud"),
		);
		const result = await handler({
			op: "create",
			id: "npc-1",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain(
			"apply_domain_transition",
		);
	});

	test("rejects location update and redirects to apply_domain_transition", async () => {
		const handler = captureLocationCrudHandler(
			createAuth("/tmp/bardo-location-crud"),
		);
		const result = await handler({
			op: "update",
			id: "river-market",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain(
			"apply_domain_transition",
		);
	});

	test("rejects faction delete and redirects to apply_domain_transition", async () => {
		const handler = captureFactionCrudHandler(
			createAuth("/tmp/bardo-faction-crud"),
		);
		const result = await handler({
			op: "delete",
			id: "guild",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain(
			"apply_domain_transition",
		);
	});
});

describe("event_crud append-only restrictions", () => {
	test("rejects create operations", async () => {
		const handler = captureEventCrudHandler(
			createAuth("/tmp/bardo-event-crud-create"),
		);
		const result = await handler({
			op: "create",
			id: "evt-1",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain("append-only");
	});

	test("rejects update operations", async () => {
		const handler = captureEventCrudHandler(
			createAuth("/tmp/bardo-event-crud-1"),
		);
		const result = await handler({
			op: "update",
			id: "evt-1",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain("append-only");
	});

	test("rejects delete operations", async () => {
		const handler = captureEventCrudHandler(
			createAuth("/tmp/bardo-event-crud-2"),
		);
		const result = await handler({
			op: "delete",
			id: "evt-1",
			dryRun: true,
		});

		expect(result.isError).toBe(true);
		expect(result.structuredContent.success).toBe(false);
		expect(result.structuredContent.message).toContain("append-only");
	});
});
