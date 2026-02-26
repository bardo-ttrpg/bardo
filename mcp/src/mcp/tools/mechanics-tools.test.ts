import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../domain/events/store";
import type { AuthContext } from "../../types/contracts";
import { registerResolveMechanicsTool } from "./resolve-mechanics";
import { registerRollDiceTool } from "./roll-dice";

type ToolResult<T> = Promise<{
	isError: boolean;
	structuredContent: T;
}>;

type RollDiceHandler = (args: {
	expression: string;
	reason?: string;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	idempotentReplay: boolean;
	roll: {
		total: number;
		rolls: number[];
	};
}>;

type ResolveMechanicsHandler = (args: {
	ruleset?: string;
	actionType: string;
	targetDifficulty?: number;
	modifier?: number;
	advantage?: "none" | "advantage" | "disadvantage";
	actorId?: string;
	declaredIntent?: string;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	idempotentReplay: boolean;
	ruleset: string;
	outcome: "success" | "failure" | null;
	total: number | null;
	rawRoll: number | null;
	resolutionMode: "dice" | "deterministic" | "unsupported";
}>;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

function captureHandlers(args: { auth: AuthContext }): {
	rollDice: RollDiceHandler;
	resolveMechanics: ResolveMechanicsHandler;
} {
	let rollDice: RollDiceHandler | null = null;
	let resolveMechanics: ResolveMechanicsHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback: RollDiceHandler | ResolveMechanicsHandler,
		): void => {
			if (name === "roll_dice") {
				rollDice = callback as RollDiceHandler;
			}
			if (name === "resolve_mechanics") {
				resolveMechanics = callback as ResolveMechanicsHandler;
			}
		},
	} as unknown as McpServer;

	registerRollDiceTool(server, args.auth);
	registerResolveMechanicsTool(server, args.auth);

	if (!rollDice || !resolveMechanics) {
		throw new Error("Failed to register mechanics tools.");
	}

	return { rollDice, resolveMechanics };
}

describe("mechanics MCP tools", () => {
	test("roll_dice returns idempotent replay for same key and appends dice_rolled event", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-roll-dice-"));
		const auth = createAuth(root);
		const { rollDice } = captureHandlers({ auth });

		const first = await rollDice({
			expression: "1d20+2",
			idempotencyKey: "roll_dice_key_12345",
		});
		const second = await rollDice({
			expression: "1d20+2",
			idempotencyKey: "roll_dice_key_12345",
		});

		expect(first.isError).toBe(false);
		expect(first.structuredContent.success).toBe(true);
		expect(first.structuredContent.idempotentReplay).toBe(false);
		expect(second.structuredContent.idempotentReplay).toBe(true);
		expect(second.structuredContent.roll.total).toBe(
			first.structuredContent.roll.total,
		);

		const events = await readCanonicalEvents({
			bardoRoot: path.join(root, "bardo"),
		});
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("dice_rolled");

		await rm(root, { recursive: true, force: true });
	});

	test("resolve_mechanics appends dice and mechanics events", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-resolve-mech-"));
		const auth = createAuth(root);
		const { resolveMechanics } = captureHandlers({ auth });

		const result = await resolveMechanics({
			actionType: "skill_check",
			targetDifficulty: 12,
			modifier: 3,
			advantage: "none",
			actorId: "pc_01",
			idempotencyKey: "resolve_mechanics_key_12345",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.total).toBeGreaterThanOrEqual(4);
		expect(result.structuredContent.total).toBeLessThanOrEqual(23);

		const events = await readCanonicalEvents({
			bardoRoot: path.join(root, "bardo"),
		});
		expect(events.length).toBe(2);
		expect(events[0]?.type).toBe("dice_rolled");
		expect(events[1]?.type).toBe("mechanics_resolved");

		await rm(root, { recursive: true, force: true });
	});

	test("resolve_mechanics supports non-d20 adapter contract", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-resolve-narrative-"),
		);
		const auth = createAuth(root);
		const { resolveMechanics } = captureHandlers({ auth });

		const result = await resolveMechanics({
			ruleset: "narrative_v1",
			actionType: "narrative_check",
			targetDifficulty: 12,
			modifier: 3,
			actorId: "pc_02",
			idempotencyKey: "resolve_mechanics_narrative_key_12345",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.ruleset).toBe("narrative_v1");
		expect(result.structuredContent.resolutionMode).toBe("deterministic");
		expect(result.structuredContent.rawRoll).toBeNull();

		const events = await readCanonicalEvents({
			bardoRoot: path.join(root, "bardo"),
		});
		expect(events.length).toBe(1);
		expect(events[0]?.type).toBe("mechanics_resolved");

		await rm(root, { recursive: true, force: true });
	});
});
