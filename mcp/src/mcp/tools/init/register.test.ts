import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { parseMarkdown } from "../../../domain/markdown/markdown";
import type { AuthContext } from "../../../types/contracts";
import { registerContextQueryTool } from "../context-query";
import { runPlayerAction } from "../player-action/register";
import { registerInitTool } from "./register";

type InitToolResult = Promise<{
	isError: boolean;
	structuredContent: {
		success: boolean;
		setupComplete: boolean;
		requiresUserInput: boolean;
		setupQuestionKey?: string | null;
		setupPrompt?: {
			questionKey: string;
		} | null;
		startingSceneSource: string;
		diceRoller: "player" | "bardo" | null;
		theme: string | null;
		startingScenePacket: {
			locationName: string;
			locationSlug: string;
			summary: string;
			openingQuestion: string;
			source: string;
		};
	};
}>;

type ContextQueryResult = Promise<{
	isError: boolean;
	structuredContent: {
		success: boolean;
		results: Array<{
			relativePath: string;
			title: string;
		}>;
	};
}>;

type InitHandler = (args: {
	bootstrapOnly?: boolean;
	bootstrapAnswers?: Record<string, string>;
	setupAnswers?: Record<string, unknown>;
	diceRoller?: "player" | "bardo";
	theme?: string;
	startingScene?: string;
}) => InitToolResult;

type ContextQueryHandler = (args: {
	query: string;
	mode?: "fast" | "deep";
	focus?: "all" | "world" | "entities" | "quests" | "state";
	limit?: number;
}) => ContextQueryResult;

function createAuth(campaignBasePath: string): AuthContext {
	return {
		apiKey: null,
		campaignBasePath,
	};
}

const COMPLETE_BOOTSTRAP_ANSWERS = {
	purpose: "Run a grounded fantasy campaign.",
	userProfile: "Solo GM playtest.",
	agentProfile: "Act as a careful and vivid GM runtime.",
	workingPreferences: "Keep responses concise and actionable.",
	boundaries: "Avoid graphic gore.",
	successCriteria: "Respect canon and provide useful scene framing.",
	values: "Curiosity and continuity.",
} as const;

const COMPLETE_SETUP_ANSWERS = {
	ttrpgSystem: "D20",
	diceRoller: "bardo",
	theme: "Classic Fantasy",
	campaignPremise:
		"Protect Thornwick while unraveling the pressure building around its frontier trade routes.",
	openingSituation:
		"The party arrives in Thornwick at dusk with the tavern packed and trouble already simmering.",
	partyRoster:
		"One cautious wanderer starts in town and needs the opening scene anchored on Thornwick.",
	sourceAdaptationNotes:
		"Use inspirations conservatively and prefer original local canon over direct lifts.",
} as const;

function captureHandlers(args: { auth: AuthContext }): {
	init: InitHandler;
	contextQuery: ContextQueryHandler;
} {
	let initHandler: InitHandler | null = null;
	let contextQueryHandler: ContextQueryHandler | null = null;
	const server = {
		registerTool: (name: string, _spec: unknown, callback: unknown): void => {
			if (name === "init") {
				initHandler = callback as InitHandler;
			}
			if (name === "context_query") {
				contextQueryHandler = callback as ContextQueryHandler;
			}
		},
	} as unknown as McpServer;

	registerInitTool(server, args.auth);
	registerContextQueryTool(server, args.auth);

	if (!initHandler || !contextQueryHandler) {
		throw new Error("Failed to register init/context_query handlers.");
	}

	return {
		init: initHandler,
		contextQuery: contextQueryHandler,
	};
}

describe("init tool", () => {
	test("honors explicit starting scene inputs and warms context for immediate retrieval", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "bardo-init-register-"));
		const { init, contextQuery } = captureHandlers({ auth: createAuth(root) });

		const result = await init({
			bootstrapAnswers: COMPLETE_BOOTSTRAP_ANSWERS,
			setupAnswers: COMPLETE_SETUP_ANSWERS,
			diceRoller: "bardo",
			theme: "Classic Fantasy",
			startingScene:
				"The frontier town of Thornwick settles into dusk as lanterns wake along the muddy street. The Broken Anvil tavern glows warm against the cold wind. What do you do first?",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.setupComplete).toBe(true);
		expect(result.structuredContent.diceRoller).toBe("bardo");
		expect(result.structuredContent.theme).toBe("Classic Fantasy");
		expect(result.structuredContent.startingSceneSource).toBe("user_provided");
		expect(result.structuredContent.startingScenePacket.locationName).toBe(
			"Thornwick",
		);
		expect(result.structuredContent.startingScenePacket.summary).toContain(
			"Thornwick",
		);
		expect(result.structuredContent.startingScenePacket.source).toBe(
			"user_provided",
		);

		const context = await contextQuery({
			query: "Thornwick dusk tavern",
			mode: "fast",
			focus: "world",
		});
		expect(context.isError).toBe(false);
		expect(context.structuredContent.success).toBe(true);
		expect(context.structuredContent.results.length).toBeGreaterThan(0);
		expect(
			context.structuredContent.results.some((resultItem) =>
				resultItem.relativePath.includes("world/scenes/starting-scene.md"),
			),
		).toBe(true);

		await rm(root, { recursive: true, force: true });
	});

	test("preserves explicit init inputs across follow-up setup calls", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-init-register-pending-inputs-"),
		);
		const { init } = captureHandlers({ auth: createAuth(root) });

		const first = await init({
			diceRoller: "bardo",
			theme: "Classic Fantasy",
			startingScene:
				"The frontier town of Thornwick settles into dusk as lanterns wake along the muddy street. The Broken Anvil tavern glows warm against the cold wind. What do you do first?",
		});
		expect(first.isError).toBe(false);
		expect(first.structuredContent.setupComplete).toBe(false);

		const second = await init({
			bootstrapAnswers: COMPLETE_BOOTSTRAP_ANSWERS,
			setupAnswers: COMPLETE_SETUP_ANSWERS,
		});

		expect(second.isError).toBe(false);
		expect(second.structuredContent.success).toBe(true);
		expect(second.structuredContent.setupComplete).toBe(true);
		expect(second.structuredContent.startingSceneSource).toBe("user_provided");
		expect(second.structuredContent.startingScenePacket.locationName).toBe(
			"Thornwick",
		);
		expect(second.structuredContent.startingScenePacket.summary).toContain(
			"Thornwick",
		);

		await rm(root, { recursive: true, force: true });
	});

	test("does not report setupComplete after bootstrapOnly when guided setup still needs the system answer", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-init-register-bootstrap-only-"),
		);
		const { init } = captureHandlers({ auth: createAuth(root) });

		const first = await init({
			diceRoller: "bardo",
			theme: "Classic Fantasy",
			startingScene:
				"The frontier town of Thornwick settles into dusk as lanterns wake along the muddy street.",
		});
		expect(first.isError).toBe(false);
		expect(first.structuredContent.setupComplete).toBe(false);

		const bootstrapCalls: Array<Record<string, string>> = [
			{ purpose: "Run a grounded fantasy campaign." },
			{ userProfile: "Solo GM playtest." },
			{ agentProfile: "Act as a careful and vivid GM runtime." },
			{ workingPreferences: "Keep responses concise and actionable." },
			{ boundaries: "Avoid graphic gore." },
			{
				successCriteria: "Respect canon and provide useful scene framing.",
			},
		];

		let finalBootstrap: Awaited<InitToolResult> | null = null;
		for (const answers of bootstrapCalls) {
			finalBootstrap = await init({
				bootstrapOnly: true,
				bootstrapAnswers: answers,
			});
		}

		expect(finalBootstrap).not.toBeNull();
		expect(finalBootstrap?.isError).toBe(false);
		expect(finalBootstrap?.structuredContent.setupComplete).toBe(false);
		expect(finalBootstrap?.structuredContent.requiresUserInput).toBe(true);
		expect(finalBootstrap?.structuredContent.diceRoller).toBe("bardo");
		expect(finalBootstrap?.structuredContent.theme).toBe("Classic Fantasy");
		expect(finalBootstrap?.structuredContent.setupQuestionKey).toBe(
			"ttrpgSystem",
		);
		expect(finalBootstrap?.structuredContent.setupPrompt?.questionKey).toBe(
			"ttrpgSystem",
		);

		await rm(root, { recursive: true, force: true });
	});

	test("seeds canonical current state so first turn stays anchored on Thornwick in strict mode", async () => {
		const previousStrict = Bun.env.BARDO_STRICT_CANONICAL_MODE;
		Bun.env.BARDO_STRICT_CANONICAL_MODE = "true";
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-init-register-canonical-seed-"),
		);
		try {
			const { init } = captureHandlers({ auth: createAuth(root) });

			const result = await init({
				bootstrapAnswers: COMPLETE_BOOTSTRAP_ANSWERS,
				setupAnswers: COMPLETE_SETUP_ANSWERS,
				diceRoller: "bardo",
				theme: "Classic Fantasy",
				startingScene:
					"The party arrives in Thornwick, a rugged frontier town at dusk where the Warm Hearth tavern glows against the cold wind.",
			});

			expect(result.isError).toBe(false);
			expect(result.structuredContent.success).toBe(true);

			const projectionRaw = await readFile(
				path.join(root, "bardo/projections/current-state.md"),
				"utf8",
			);
			const projectionState = JSON.parse(
				parseMarkdown(projectionRaw).content,
			) as {
				currentLocation: string;
				party: { currentLocation: string };
			};
			expect(projectionState.currentLocation).toBe("thornwick");
			expect(projectionState.party.currentLocation).toBe("thornwick");

			const action = await runPlayerAction({
				auth: createAuth(root),
				action:
					"I enter the Warm Hearth tavern and ask the barkeep their name.",
				idempotencyKey: "player_action_init_anchor_key_12345",
				guidedSetupEnabled: false,
				nowIso: "2026-02-23T03:30:00.000Z",
			});

			expect(action.success).toBe(true);
			expect(action.locationAfter).toBe("loc_tavern_thornwick");
			expect(action.stateDelta.locationBefore).toBe("thornwick");
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
