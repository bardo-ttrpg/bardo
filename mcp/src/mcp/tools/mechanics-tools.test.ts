import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readCanonicalEvents } from "../../domain/events/store";
import type { AuthContext } from "../../types/contracts";
import { registerRulesetMechanicsOverviewTool } from "./ruleset-mechanics-overview";
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
	opposedDifficulty?: number;
	opposedModifier?: number;
	opposedTotal?: number;
	modifier?: number;
	advantage?: "none" | "advantage" | "disadvantage";
	actorId?: string;
	declaredIntent?: string;
	availableResources?: Record<string, number>;
	idempotencyKey?: string;
}) => ToolResult<{
	success: boolean;
	idempotentReplay: boolean;
	ruleset: string;
	supportLevel?: string;
	outcome: string | null;
	total: number | null;
	rawRoll: number | null;
	resolutionMode:
		| "dice"
		| "deterministic"
		| "partial"
		| "advisory"
		| "unsupported";
	requiresHumanJudgment?: boolean;
	outcomeBand?: {
		id: string;
		label: string;
	} | null;
	contested?: {
		comparison: string;
		opponentTotal: number | null;
	} | null;
	stateEffects?: {
		resources: Array<{
			resourceId: string;
			operation: string;
			amount: number;
			balanceAfter: number | null;
			guidance?: string | null;
		}>;
		clocks: Array<{
			clockId: string;
			ticks: number;
			guidance?: string | null;
		}>;
	};
	consequencePlan?: {
		matchedChains: Array<{
			id: string;
			label: string;
			reason?: string | null;
		}>;
		steps: Array<{
			chainId: string;
			type: string;
			applied: boolean;
			guidance?: string | null;
			unlockedChainIds?: string[];
			resourceId?: string;
			clockId?: string;
			decisionId?: string;
		}>;
		branchTransitions?: Array<{
			fromChainId: string;
			fromChainLabel: string;
			stepIndex: number;
			toChainId: string;
			toChainLabel: string | null;
			guidance?: string | null;
		}>;
		decisionNodes: Array<{
			id: string;
			kind: "ask_the_table";
			prompt: string;
			guidance?: string | null;
			options?: string[];
			chainId: string;
			chainLabel: string;
			stepIndex: number;
		}>;
	};
}>;

type RulesetOverviewHandler = (args: {
	ruleset?: string;
}) => ToolResult<{
	success: boolean;
		rulesets: Array<{
			id: string;
			sourceType?: string;
			actionTypes: Array<{
				id: string;
				supportLevel?: string;
				outcomeBands?: Array<{
					id: string;
					outcome: string;
				}>;
				consequenceChains?: Array<{
					id: string;
					entrypoint?: string;
					steps: Array<{
						type: string;
						branches?: Array<{
							chainId: string;
						}>;
					}>;
				}>;
			}>;
		}>;
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
	rulesetOverview: RulesetOverviewHandler;
} {
	let rollDice: RollDiceHandler | null = null;
	let resolveMechanics: ResolveMechanicsHandler | null = null;
	let rulesetOverview: RulesetOverviewHandler | null = null;
	const server = {
		registerTool: (
			name: string,
			_spec: unknown,
			callback:
				| RollDiceHandler
				| ResolveMechanicsHandler
				| RulesetOverviewHandler,
		): void => {
			if (name === "roll_dice") {
				rollDice = callback as RollDiceHandler;
			}
			if (name === "resolve_mechanics") {
				resolveMechanics = callback as ResolveMechanicsHandler;
			}
			if (name === "ruleset_mechanics_overview") {
				rulesetOverview = callback as RulesetOverviewHandler;
			}
		},
	} as unknown as McpServer;

	registerRollDiceTool(server, args.auth);
	registerResolveMechanicsTool(server, args.auth);
	registerRulesetMechanicsOverviewTool(server, args.auth);

	if (!rollDice || !resolveMechanics || !rulesetOverview) {
		throw new Error("Failed to register mechanics tools.");
	}

	return { rollDice, resolveMechanics, rulesetOverview };
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

	test("resolve_mechanics supports workspace manifest rulesets and advisory actions", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-resolve-workspace-ruleset-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "rules"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "rules/mechanics.json"),
			JSON.stringify(
				{
					rulesets: [
						{
							id: "forged-custom-v2",
							title: "Forged Custom",
							capabilities: {
								contested: true,
								conditions: false,
								initiative: false,
								interrupts: true,
								resourceTracking: true,
							},
							actionTypes: [
								{
									id: "positioning_test",
									label: "Positioning Test",
									intents: ["exploration", "combat"],
									supportLevel: "full",
									targetDifficulty: {
										required: true,
										min: 1,
										max: 20,
									},
									modifier: {
										default: 0,
										min: -3,
										max: 6,
									},
									resolution: {
										mode: "dice",
										expression: "2d6+{modifier}",
										successCondition: "total_gte_target",
									},
								},
								{
									id: "doom_cost",
									label: "Doom Cost",
									intents: ["social"],
									supportLevel: "advisory",
									targetDifficulty: {
										required: false,
									},
									modifier: {
										default: 0,
										min: 0,
										max: 5,
									},
									resolution: {
										mode: "advisory",
										guidance:
											"Ask the table what cost feels appropriately ominous before finalizing.",
									},
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const auth = createAuth(root);
		const { resolveMechanics, rulesetOverview } = captureHandlers({ auth });

		const diceResult = await resolveMechanics({
			ruleset: "forged-custom-v2",
			actionType: "positioning_test",
			targetDifficulty: 9,
			modifier: 2,
			actorId: "pc_03",
			idempotencyKey: "resolve_workspace_positioning_key_12345",
		});
		const advisoryResult = await resolveMechanics({
			ruleset: "forged-custom-v2",
			actionType: "doom_cost",
			modifier: 2,
			actorId: "pc_03",
			idempotencyKey: "resolve_workspace_doom_key_12345",
		});
		const overview = await rulesetOverview({
			ruleset: "forged-custom-v2",
		});

		expect(diceResult.isError).toBe(false);
		expect(diceResult.structuredContent.success).toBe(true);
		expect(diceResult.structuredContent.ruleset).toBe("forged-custom-v2");
		expect(diceResult.structuredContent.resolutionMode).toBe("dice");
		expect(diceResult.structuredContent.total).toBeGreaterThanOrEqual(4);
		expect(diceResult.structuredContent.total).toBeLessThanOrEqual(14);
		expect(diceResult.structuredContent.supportLevel).toBe("full");

		expect(advisoryResult.isError).toBe(false);
		expect(advisoryResult.structuredContent.success).toBe(true);
		expect(advisoryResult.structuredContent.resolutionMode).toBe("advisory");
		expect(advisoryResult.structuredContent.supportLevel).toBe("advisory");
		expect(advisoryResult.structuredContent.requiresHumanJudgment).toBe(true);

		expect(overview.isError).toBe(false);
		expect(overview.structuredContent.rulesets[0]?.id).toBe("forged-custom-v2");
		expect(overview.structuredContent.rulesets[0]?.sourceType).toBe("workspace");
		const hasAdvisoryAction =
			overview.structuredContent.rulesets[0]?.actionTypes.some(
				(action) =>
					action.id === "doom_cost" && action.supportLevel === "advisory",
			) ?? false;
		expect(hasAdvisoryAction).toBe(true);

		const events = await readCanonicalEvents({ bardoRoot });
		expect(events.some((event) => event.type === "dice_rolled")).toBe(true);
		expect(events.some((event) => event.type === "mechanics_resolved")).toBe(
			true,
		);

		await rm(root, { recursive: true, force: true });
	});

	test("resolve_mechanics applies contested checks, outcome bands, resource effects, and clock hooks from the manifest", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-resolve-workspace-advanced-ruleset-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "rules"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "rules/mechanics.json"),
			JSON.stringify(
				{
					rulesets: [
						{
							id: "forged-advanced-v1",
							title: "Forged Advanced",
							capabilities: {
								contested: true,
								conditions: false,
								initiative: false,
								interrupts: true,
								resourceTracking: true,
							},
							actionTypes: [
								{
									id: "duel_clash",
									label: "Duel Clash",
									intents: ["combat"],
									supportLevel: "full",
									targetDifficulty: {
										required: false,
									},
									modifier: {
										default: 0,
										min: -2,
										max: 5,
									},
									resolution: {
										mode: "dice",
										expression: "1d6+{modifier}",
										successCondition: "always_success",
										contested: {
											enabled: true,
											opponentLabel: "Rival duelist",
											opponentExpression: "1d6+{opposedModifier}",
											tieOutcome: "mixed",
										},
									},
									outcomeBands: [
										{
											id: "critical-edge",
											label: "Critical Edge",
											outcome: "critical_success",
											minMargin: 3,
										},
										{
											id: "pressed-advantage",
											label: "Pressed Advantage",
											outcome: "success",
											minMargin: 1,
											maxMargin: 2,
										},
										{
											id: "desperate-trade",
											label: "Desperate Trade",
											outcome: "mixed",
											minMargin: 0,
											maxMargin: 0,
										},
										{
											id: "setback",
											label: "Setback",
											outcome: "failure",
											maxMargin: -1,
										},
									],
									resourceEffects: [
										{
											resourceId: "stress",
											operation: "spend",
											amount: 1,
											onOutcomes: ["mixed", "failure"],
											guidance: "Mark stress when the duel becomes costly.",
										},
									],
									clockEffects: [
										{
											clockId: "duel-escalation",
											ticks: 2,
											onOutcomes: ["critical_success", "success"],
											guidance: "Advance the duel escalation clock on strong results.",
										},
									],
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const auth = createAuth(root);
		const { resolveMechanics, rulesetOverview } = captureHandlers({ auth });

		const result = await resolveMechanics({
			ruleset: "forged-advanced-v1",
			actionType: "duel_clash",
			modifier: 5,
			opposedTotal: 1,
			availableResources: {
				stress: 3,
			},
			actorId: "pc_04",
			idempotencyKey: "resolve_workspace_advanced_key_12345",
		});
		const costlyResult = await resolveMechanics({
			ruleset: "forged-advanced-v1",
			actionType: "duel_clash",
			modifier: -2,
			opposedTotal: 12,
			availableResources: {
				stress: 3,
			},
			actorId: "pc_04",
			idempotencyKey: "resolve_workspace_advanced_costly_key_12345",
		});
		const overview = await rulesetOverview({
			ruleset: "forged-advanced-v1",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.ruleset).toBe("forged-advanced-v1");
		expect(result.structuredContent.contested?.comparison).toBe("actor_wins");
		expect(result.structuredContent.outcomeBand?.id).toBe("critical-edge");
		expect(result.structuredContent.outcome).toBe("critical_success");
		expect(result.structuredContent.stateEffects?.clocks).toEqual([
			{
				clockId: "duel-escalation",
				ticks: 2,
				guidance: "Advance the duel escalation clock on strong results.",
			},
		]);
		expect(result.structuredContent.stateEffects?.resources).toEqual([]);
		expect(costlyResult.structuredContent.outcome).toBe("failure");
		expect(costlyResult.structuredContent.stateEffects?.resources).toEqual([
			{
				resourceId: "stress",
				operation: "spend",
				amount: 1,
				balanceAfter: 2,
				guidance: "Mark stress when the duel becomes costly.",
			},
		]);

		const overviewAction =
			overview.structuredContent.rulesets[0]?.actionTypes.find(
				(action) => action.id === "duel_clash",
			) ?? null;
		expect(overviewAction?.outcomeBands?.some((band) => band.id === "critical-edge")).toBe(
			true,
		);

		await rm(root, { recursive: true, force: true });
	});

	test("resolve_mechanics composes chained manifest consequences with conditional triggers and ask-the-table nodes", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-resolve-workspace-consequence-chain-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "rules"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "rules/mechanics.json"),
			JSON.stringify(
				{
					rulesets: [
						{
							id: "forged-consequences-v1",
							title: "Forged Consequences",
							capabilities: {
								contested: true,
								conditions: true,
								initiative: false,
								interrupts: true,
								resourceTracking: true,
							},
							actionTypes: [
								{
									id: "risky_bargain",
									label: "Risky Bargain",
									intents: ["social"],
									supportLevel: "full",
									targetDifficulty: {
										required: true,
										default: 11,
									},
									modifier: {
										default: 3,
										min: 0,
										max: 6,
									},
									resolution: {
										mode: "deterministic",
										deterministicTotal: 10,
										successCondition: "total_gte_target",
										contested: {
											enabled: true,
											opponentLabel: "Suspicious broker",
											tieOutcome: "mixed",
										},
									},
									outcomeBands: [
										{
											id: "narrow-edge",
											label: "Narrow Edge",
											outcome: "success",
											minMargin: 2,
											maxMargin: 2,
										},
									],
									consequenceChains: [
										{
											id: "compromise-cost",
											label: "Compromise Cost",
											when: {
												onOutcomes: ["success"],
												onOutcomeBands: ["narrow-edge"],
											},
											steps: [
												{
													type: "resource_effect",
													resourceId: "stress",
													operation: "spend",
													amount: 1,
													guidance:
														"Mark stress because the bargain only barely lands.",
												},
												{
													type: "clock_effect",
													clockId: "broker-suspicion",
													ticks: 1,
													when: {
														resourceAtOrBelow: {
															resourceId: "stress",
															value: 0,
														},
													},
													guidance:
														"Advance suspicion when the negotiator is visibly strained.",
												},
												{
													type: "decision_node",
													id: "choose-the-price",
													kind: "ask_the_table",
													when: {
														onOutcomeBands: ["narrow-edge"],
													},
													prompt:
														"Ask the table what concrete concession the broker demands in exchange for the deal.",
													options: [
														"Owe a dangerous favor",
														"Reveal a compromising truth",
													],
													guidance:
														"Present both options, then let the table invent a third if the fiction demands it.",
												},
											],
										},
									],
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const auth = createAuth(root);
		const { resolveMechanics, rulesetOverview } = captureHandlers({ auth });

		const result = await resolveMechanics({
			ruleset: "forged-consequences-v1",
			actionType: "risky_bargain",
			targetDifficulty: 11,
			modifier: 3,
			opposedTotal: 11,
			availableResources: {
				stress: 1,
			},
			actorId: "pc_05",
			idempotencyKey: "resolve_workspace_consequence_chain_key_12345",
		});
		const overview = await rulesetOverview({
			ruleset: "forged-consequences-v1",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.outcome).toBe("success");
		expect(result.structuredContent.outcomeBand?.id).toBe("narrow-edge");
		expect(result.structuredContent.requiresHumanJudgment).toBe(true);
		expect(result.structuredContent.stateEffects?.resources).toEqual([
			{
				resourceId: "stress",
				operation: "spend",
				amount: 1,
				balanceAfter: 0,
				guidance: "Mark stress because the bargain only barely lands.",
			},
		]);
		expect(result.structuredContent.stateEffects?.clocks).toEqual([
			{
				clockId: "broker-suspicion",
				ticks: 1,
				guidance:
					"Advance suspicion when the negotiator is visibly strained.",
			},
		]);
		expect(result.structuredContent.consequencePlan?.matchedChains).toEqual([
			{
				id: "compromise-cost",
				label: "Compromise Cost",
				reason: "Matched outcome success and outcome band narrow-edge.",
			},
		]);
		expect(result.structuredContent.consequencePlan?.decisionNodes).toEqual([
			{
				id: "choose-the-price",
				kind: "ask_the_table",
				prompt:
					"Ask the table what concrete concession the broker demands in exchange for the deal.",
				guidance:
					"Present both options, then let the table invent a third if the fiction demands it.",
				options: ["Owe a dangerous favor", "Reveal a compromising truth"],
				chainId: "compromise-cost",
				chainLabel: "Compromise Cost",
				stepIndex: 2,
			},
		]);
		expect(
			result.structuredContent.consequencePlan?.steps.map((step) => ({
				chainId: step.chainId,
				type: step.type,
				applied: step.applied,
			})),
		).toEqual([
			{
				chainId: "compromise-cost",
				type: "resource_effect",
				applied: true,
			},
			{
				chainId: "compromise-cost",
				type: "clock_effect",
				applied: true,
			},
			{
				chainId: "compromise-cost",
				type: "decision_node",
				applied: true,
			},
		]);

		const overviewAction =
			overview.structuredContent.rulesets[0]?.actionTypes.find(
				(action) => action.id === "risky_bargain",
			) ?? null;
		expect(overviewAction?.consequenceChains?.[0]?.id).toBe("compromise-cost");
		expect(
			overviewAction?.consequenceChains?.[0]?.steps.map((step) => step.type),
		).toEqual(["resource_effect", "clock_effect", "decision_node"]);

		await rm(root, { recursive: true, force: true });
	});

	test("resolve_mechanics unlocks follow-up consequence chains from applied branch steps", async () => {
		const root = await mkdtemp(
			path.join(os.tmpdir(), "bardo-resolve-workspace-consequence-branch-"),
		);
		const bardoRoot = path.join(root, "bardo");
		await mkdir(path.join(bardoRoot, "rules"), { recursive: true });
		await writeFile(
			path.join(bardoRoot, "rules/mechanics.json"),
			JSON.stringify(
				{
					rulesets: [
						{
							id: "forged-branches-v1",
							title: "Forged Branches",
							capabilities: {
								contested: true,
								conditions: true,
								initiative: false,
								interrupts: true,
								resourceTracking: true,
							},
							actionTypes: [
								{
									id: "risky_bargain",
									label: "Risky Bargain",
									intents: ["social"],
									supportLevel: "full",
									targetDifficulty: {
										required: true,
										default: 11,
									},
									modifier: {
										default: 3,
										min: 0,
										max: 6,
									},
									resolution: {
										mode: "deterministic",
										deterministicTotal: 10,
										successCondition: "total_gte_target",
									},
									outcomeBands: [
										{
											id: "narrow-edge",
											label: "Narrow Edge",
											outcome: "success",
											minMargin: 2,
											maxMargin: 2,
										},
									],
									consequenceChains: [
										{
											id: "compromise-cost",
											label: "Compromise Cost",
											entrypoint: "root",
											when: {
												onOutcomes: ["success"],
												onOutcomeBands: ["narrow-edge"],
											},
											steps: [
												{
													type: "resource_effect",
													resourceId: "stress",
													operation: "spend",
													amount: 1,
													guidance:
														"Mark stress because the bargain only barely lands.",
													branches: [
														{
															chainId: "broker-leverage",
															when: {
																resourceAtOrBelow: {
																	resourceId: "stress",
																	value: 0,
																},
															},
															guidance:
																"The broker notices the strain and presses the advantage.",
														},
													],
												},
											],
										},
										{
											id: "broker-leverage",
											label: "Broker Leverage",
											entrypoint: "branch",
											steps: [
												{
													type: "clock_effect",
													clockId: "broker-suspicion",
													ticks: 1,
													guidance:
														"Advance suspicion once the broker senses leverage.",
												},
												{
													type: "decision_node",
													id: "name-the-concession",
													kind: "ask_the_table",
													prompt:
														"Ask the table what concession the broker demands right now.",
													options: [
														"Promise future access",
														"Expose a vulnerable ally",
													],
													guidance:
														"Let the table refine the concession so it stays specific to the current fiction.",
												},
											],
										},
									],
								},
							],
						},
					],
				},
				null,
				2,
			),
			"utf8",
		);

		const auth = createAuth(root);
		const { resolveMechanics, rulesetOverview } = captureHandlers({ auth });

		const result = await resolveMechanics({
			ruleset: "forged-branches-v1",
			actionType: "risky_bargain",
			targetDifficulty: 11,
			modifier: 3,
			availableResources: {
				stress: 1,
			},
			actorId: "pc_06",
			idempotencyKey: "resolve_workspace_consequence_branch_key_12345",
		});
		const overview = await rulesetOverview({
			ruleset: "forged-branches-v1",
		});

		expect(result.isError).toBe(false);
		expect(result.structuredContent.success).toBe(true);
		expect(result.structuredContent.outcomeBand?.id).toBe("narrow-edge");
		expect(
			result.structuredContent.consequencePlan?.matchedChains.map((chain) => chain.id),
		).toEqual(["compromise-cost", "broker-leverage"]);
		expect(result.structuredContent.stateEffects?.resources).toEqual([
			{
				resourceId: "stress",
				operation: "spend",
				amount: 1,
				balanceAfter: 0,
				guidance: "Mark stress because the bargain only barely lands.",
			},
		]);
		expect(result.structuredContent.stateEffects?.clocks).toEqual([
			{
				clockId: "broker-suspicion",
				ticks: 1,
				guidance: "Advance suspicion once the broker senses leverage.",
			},
		]);
		expect(result.structuredContent.consequencePlan?.branchTransitions).toEqual([
			{
				fromChainId: "compromise-cost",
				fromChainLabel: "Compromise Cost",
				stepIndex: 0,
				toChainId: "broker-leverage",
				toChainLabel: "Broker Leverage",
				guidance: "The broker notices the strain and presses the advantage.",
			},
		]);
		expect(
			result.structuredContent.consequencePlan?.steps.map((step) => ({
				chainId: step.chainId,
				type: step.type,
				unlockedChainIds: step.unlockedChainIds ?? [],
			})),
		).toEqual([
			{
				chainId: "compromise-cost",
				type: "resource_effect",
				unlockedChainIds: ["broker-leverage"],
			},
			{
				chainId: "broker-leverage",
				type: "clock_effect",
				unlockedChainIds: [],
			},
			{
				chainId: "broker-leverage",
				type: "decision_node",
				unlockedChainIds: [],
			},
		]);

		const overviewAction =
			overview.structuredContent.rulesets[0]?.actionTypes.find(
				(action) => action.id === "risky_bargain",
			) ?? null;
		expect(overviewAction?.consequenceChains?.map((chain) => chain.id)).toEqual([
			"compromise-cost",
			"broker-leverage",
		]);
		expect(overviewAction?.consequenceChains?.[0]?.entrypoint).toBe("root");
		expect(
			overviewAction?.consequenceChains?.[0]?.steps[0]?.branches?.map(
				(branch) => branch.chainId,
			),
		).toEqual(["broker-leverage"]);

		await rm(root, { recursive: true, force: true });
	});
});
