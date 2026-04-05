import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { rollD20Check, rollDiceExpression } from "../dice";
import type {
	MechanicsComparison,
	MechanicsActionType,
	MechanicsConsequenceStepResolution,
	MechanicsDecisionNodeResolution,
	MechanicsResolution,
	MechanicsSupportLevel,
	MechanicsValidationInput,
	MechanicsValidationResult,
	ResolveMechanicsInput,
	RulesetActionDefinition,
	RulesetAdapter,
	RulesetConsequenceBranchDefinition,
	RulesetClockEffectDefinition,
	RulesetConsequenceChainDefinition,
	RulesetConsequenceConditionDefinition,
	RulesetConsequenceStepDefinition,
	RulesetCapabilities,
	RulesetCatalogEntry,
	RulesetDecisionNodeDefinition,
	RulesetOutcomeBandDefinition,
	RulesetResourceEffectDefinition,
} from "./types";

const targetDifficultySchema = z.object({
	required: z.boolean().default(false),
	min: z.number().int().optional(),
	max: z.number().int().optional(),
	default: z.number().int().optional(),
});

const modifierSchema = z.object({
	default: z.number().int().default(0),
	min: z.number().int().optional(),
	max: z.number().int().optional(),
});

const contestedSchema = z.object({
	enabled: z.boolean().default(false),
	opponentLabel: z.string().trim().min(1).optional(),
	opponentExpression: z.string().trim().min(1).optional(),
	tieOutcome: z.string().trim().min(1).optional(),
});

const outcomeBandSchema = z.object({
	id: z.string().trim().min(1).max(80),
	label: z.string().trim().min(1).max(120),
	outcome: z.string().trim().min(1).max(120),
	minMargin: z.number().int().optional(),
	maxMargin: z.number().int().optional(),
	guidance: z.string().trim().min(1).optional(),
});

const resourceThresholdSchema = z.object({
	resourceId: z.string().trim().min(1).max(120),
	value: z.number().int(),
});

const consequenceConditionSchema = z.object({
	onOutcomes: z.array(z.string().trim().min(1).max(120)).default([]),
	onOutcomeBands: z.array(z.string().trim().min(1).max(120)).default([]),
	onComparisons: z
		.array(z.enum(["actor_wins", "opponent_wins", "tie", "unresolved"]))
		.default([]),
	minMargin: z.number().int().optional(),
	maxMargin: z.number().int().optional(),
	resourceAtOrBelow: resourceThresholdSchema.optional(),
	resourceAtOrAbove: resourceThresholdSchema.optional(),
});

const consequenceBranchSchema = z.object({
	chainId: z.string().trim().min(1).max(120),
	when: consequenceConditionSchema.optional(),
	guidance: z.string().trim().min(1).optional(),
});

const resourceEffectSchema = z.object({
	resourceId: z.string().trim().min(1).max(120),
	operation: z.enum(["spend", "gain", "set"]),
	amount: z.number().int(),
	onOutcomes: z.array(z.string().trim().min(1).max(120)).default([]),
	when: consequenceConditionSchema.optional(),
	branches: z.array(consequenceBranchSchema).default([]),
	guidance: z.string().trim().min(1).optional(),
});

const clockEffectSchema = z.object({
	clockId: z.string().trim().min(1).max(120),
	ticks: z.number().int().positive(),
	onOutcomes: z.array(z.string().trim().min(1).max(120)).default([]),
	when: consequenceConditionSchema.optional(),
	branches: z.array(consequenceBranchSchema).default([]),
	guidance: z.string().trim().min(1).optional(),
});

const decisionNodeSchema = z.object({
	id: z.string().trim().min(1).max(120),
	kind: z.literal("ask_the_table").default("ask_the_table"),
	prompt: z.string().trim().min(1).max(600),
	options: z.array(z.string().trim().min(1).max(200)).default([]),
	branches: z.array(consequenceBranchSchema).default([]),
	guidance: z.string().trim().min(1).optional(),
});

const consequenceStepSchema = z.discriminatedUnion("type", [
	resourceEffectSchema.extend({
		type: z.literal("resource_effect"),
	}),
	clockEffectSchema.extend({
		type: z.literal("clock_effect"),
	}),
	decisionNodeSchema.extend({
		type: z.literal("decision_node"),
		when: consequenceConditionSchema.optional(),
	}),
]);

const consequenceChainSchema = z.object({
	id: z.string().trim().min(1).max(120),
	label: z.string().trim().min(1).max(160),
	entrypoint: z.enum(["root", "branch"]).default("root"),
	when: consequenceConditionSchema.optional(),
	steps: z.array(consequenceStepSchema).min(1),
});

const resolutionSchema = z.object({
	mode: z.enum(["dice", "deterministic", "partial", "advisory"]),
	expression: z.string().trim().min(1).optional(),
	successCondition: z
		.enum([
			"total_gte_target",
			"total_lte_target",
			"always_success",
			"always_failure",
		])
		.optional(),
	deterministicTotal: z.number().int().optional(),
	guidance: z.string().trim().min(1).optional(),
	contested: contestedSchema.optional(),
});

const actionTypeSchema = z.object({
	id: z.string().trim().min(1).max(120),
	label: z.string().trim().min(1).max(160),
	description: z.string().trim().min(1).max(600).optional(),
	intents: z.array(z.string().trim().min(1).max(80)).default([]),
	supportLevel: z.enum(["full", "partial", "advisory"]).default("full"),
	targetDifficulty: targetDifficultySchema.default({ required: false }),
	modifier: modifierSchema.default({ default: 0 }),
	resolution: resolutionSchema,
	outcomeBands: z.array(outcomeBandSchema).default([]),
	resourceEffects: z.array(resourceEffectSchema).default([]),
	clockEffects: z.array(clockEffectSchema).default([]),
	consequenceChains: z.array(consequenceChainSchema).default([]),
});

const capabilitiesSchema = z.object({
	contested: z.boolean().default(false),
	conditions: z.boolean().default(false),
	initiative: z.boolean().default(false),
	interrupts: z.boolean().default(false),
	resourceTracking: z.boolean().default(false),
});

const rulesetSchema = z.object({
	id: z.string().trim().min(1).max(120),
	title: z.string().trim().min(1).max(160),
	capabilities: capabilitiesSchema,
	actionTypes: z.array(actionTypeSchema).min(1),
});

const manifestSchema = z.object({
	rulesets: z.array(rulesetSchema).default([]),
});

function normalizeConsequenceCondition(
	condition: z.infer<typeof consequenceConditionSchema> | undefined,
): RulesetConsequenceConditionDefinition | null {
	if (!condition) {
		return null;
	}
	return {
		onOutcomes: [...condition.onOutcomes],
		onOutcomeBands: [...condition.onOutcomeBands],
		onComparisons: [...condition.onComparisons],
		minMargin: condition.minMargin ?? null,
		maxMargin: condition.maxMargin ?? null,
		resourceAtOrBelow: condition.resourceAtOrBelow
			? {
					resourceId: condition.resourceAtOrBelow.resourceId,
					value: condition.resourceAtOrBelow.value,
				}
			: null,
		resourceAtOrAbove: condition.resourceAtOrAbove
			? {
					resourceId: condition.resourceAtOrAbove.resourceId,
					value: condition.resourceAtOrAbove.value,
				}
			: null,
	};
}

function normalizeDecisionNode(
	node: z.infer<typeof decisionNodeSchema>,
): RulesetDecisionNodeDefinition {
	return {
		id: node.id,
		kind: "ask_the_table",
		prompt: node.prompt,
		options: [...node.options],
		guidance: node.guidance ?? null,
	};
}

function normalizeConsequenceBranch(
	branch: z.infer<typeof consequenceBranchSchema>,
): RulesetConsequenceBranchDefinition {
	return {
		chainId: branch.chainId,
		when: normalizeConsequenceCondition(branch.when),
		guidance: branch.guidance ?? null,
	};
}

function normalizeConsequenceStep(
	step: z.infer<typeof consequenceStepSchema>,
): RulesetConsequenceStepDefinition {
	if (step.type === "resource_effect") {
		return {
			type: "resource_effect",
			resourceId: step.resourceId,
			operation: step.operation,
			amount: step.amount,
			onOutcomes: [...step.onOutcomes],
			when: normalizeConsequenceCondition(step.when),
			branches: step.branches.map(normalizeConsequenceBranch),
			guidance: step.guidance ?? null,
		};
	}
	if (step.type === "clock_effect") {
		return {
			type: "clock_effect",
			clockId: step.clockId,
			ticks: step.ticks,
			onOutcomes: [...step.onOutcomes],
			when: normalizeConsequenceCondition(step.when),
			branches: step.branches.map(normalizeConsequenceBranch),
			guidance: step.guidance ?? null,
		};
	}
	return {
		type: "decision_node",
		...normalizeDecisionNode(step),
		when: normalizeConsequenceCondition(step.when),
		branches: step.branches.map(normalizeConsequenceBranch),
	};
}

function normalizeConsequenceChain(
	chain: z.infer<typeof consequenceChainSchema>,
): RulesetConsequenceChainDefinition {
	return {
		id: chain.id,
		label: chain.label,
		entrypoint: chain.entrypoint,
		when: normalizeConsequenceCondition(chain.when),
		steps: chain.steps.map(normalizeConsequenceStep),
	};
}

function normalizeActionDefinition(
	action: z.infer<typeof actionTypeSchema>,
): RulesetActionDefinition {
	return {
		id: action.id,
		label: action.label,
		description: action.description ?? null,
		intents: [...action.intents],
		supportLevel: action.supportLevel,
		targetDifficulty: {
			required: action.targetDifficulty.required,
			min: action.targetDifficulty.min ?? null,
			max: action.targetDifficulty.max ?? null,
			default: action.targetDifficulty.default ?? null,
		},
		modifier: {
			default: action.modifier.default,
			min: action.modifier.min ?? null,
			max: action.modifier.max ?? null,
		},
		contested: {
			enabled: action.resolution.contested?.enabled ?? false,
			opponentLabel: action.resolution.contested?.opponentLabel ?? null,
			opponentExpression: action.resolution.contested?.opponentExpression ?? null,
			tieOutcome: action.resolution.contested?.tieOutcome ?? null,
		},
		resolution: {
			mode: action.resolution.mode,
			expression: action.resolution.expression ?? null,
			successCondition: action.resolution.successCondition ?? null,
			deterministicTotal: action.resolution.deterministicTotal ?? null,
			guidance: action.resolution.guidance ?? null,
		},
		outcomeBands: action.outcomeBands.map(
			(outcomeBand): RulesetOutcomeBandDefinition => ({
				id: outcomeBand.id,
				label: outcomeBand.label,
				outcome: outcomeBand.outcome,
				minMargin: outcomeBand.minMargin ?? null,
				maxMargin: outcomeBand.maxMargin ?? null,
				guidance: outcomeBand.guidance ?? null,
			}),
		),
		resourceEffects: action.resourceEffects.map(
			(effect): RulesetResourceEffectDefinition => ({
				resourceId: effect.resourceId,
				operation: effect.operation,
				amount: effect.amount,
				onOutcomes: effect.onOutcomes,
				when: normalizeConsequenceCondition(effect.when),
				guidance: effect.guidance ?? null,
			}),
		),
		clockEffects: action.clockEffects.map(
			(effect): RulesetClockEffectDefinition => ({
				clockId: effect.clockId,
				ticks: effect.ticks,
				onOutcomes: effect.onOutcomes,
				when: normalizeConsequenceCondition(effect.when),
				guidance: effect.guidance ?? null,
			}),
		),
		consequenceChains: action.consequenceChains.map(normalizeConsequenceChain),
	};
}

function normalizeRulesetEntry(
	ruleset: z.infer<typeof rulesetSchema>,
): RulesetCatalogEntry {
	return {
		id: ruleset.id,
		title: ruleset.title,
		sourceType: "workspace",
		capabilities: ruleset.capabilities,
		actionTypes: ruleset.actionTypes.map(normalizeActionDefinition),
	};
}

function parseManifestFile(filePath: string): RulesetCatalogEntry[] {
	const raw = readFileSync(filePath, "utf8");
	const parsed = manifestSchema.parse(JSON.parse(raw));
	return parsed.rulesets.map(normalizeRulesetEntry);
}

function readWorkspaceManifestEntries(bardoRoot: string): RulesetCatalogEntry[] {
	const rulesDir = path.join(bardoRoot, "rules");
	if (!existsSync(rulesDir)) {
		return [];
	}

	const collected: RulesetCatalogEntry[] = [];
	const singleManifestPath = path.join(rulesDir, "mechanics.json");
	if (existsSync(singleManifestPath)) {
		collected.push(...parseManifestFile(singleManifestPath));
	}

	const manifestDir = path.join(rulesDir, "mechanics");
	if (existsSync(manifestDir) && statSync(manifestDir).isDirectory()) {
		for (const entry of readdirSync(manifestDir).sort()) {
			if (!entry.toLowerCase().endsWith(".json")) {
				continue;
			}
			collected.push(...parseManifestFile(path.join(manifestDir, entry)));
		}
	}

	return collected;
}

function normalizeInput(
	rulesetId: string,
	actionDefinition: RulesetActionDefinition,
	input: ResolveMechanicsInput,
): MechanicsValidationInput {
	return {
		ruleset: rulesetId,
		actionType: input.actionType,
		targetDifficulty:
			typeof input.targetDifficulty === "number"
				? input.targetDifficulty
				: actionDefinition.targetDifficulty.default,
		modifier:
			typeof input.modifier === "number"
				? input.modifier
				: actionDefinition.modifier.default,
		opposedDifficulty:
			typeof input.opposedDifficulty === "number" ? input.opposedDifficulty : null,
		opposedModifier:
			typeof input.opposedModifier === "number" ? input.opposedModifier : 0,
		opposedTotal:
			typeof input.opposedTotal === "number" ? input.opposedTotal : null,
		actorId:
			typeof input.actorId === "string" && input.actorId.trim().length > 0
				? input.actorId.trim()
				: null,
		declaredIntent:
			typeof input.declaredIntent === "string" &&
			input.declaredIntent.trim().length > 0
				? input.declaredIntent.trim()
				: null,
		advantage:
			actionDefinition.resolution.mode === "dice" ? (input.advantage ?? "none") : null,
		availableResources:
			input.availableResources && Object.keys(input.availableResources).length > 0
				? input.availableResources
				: null,
	};
}

function findActionDefinition(
	actionTypes: readonly RulesetActionDefinition[],
	actionType: string,
): RulesetActionDefinition | null {
	return actionTypes.find((candidate) => candidate.id === actionType) ?? null;
}

function supportRank(level: MechanicsSupportLevel): number {
	return level === "full" ? 3 : level === "partial" ? 2 : 1;
}

function canonicalIntent(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (normalized === "exploration" || normalized === "investigation") {
		return "explore";
	}
	if (normalized === "journey" || normalized === "movement") {
		return "travel";
	}
	return normalized;
}

function validationWarnings(
	actionDefinition: RulesetActionDefinition,
	normalized: MechanicsValidationInput,
): string[] {
	const warnings: string[] = [];
	if (normalized.actorId === null) {
		warnings.push(
			"actorId is missing; auditability for this action will be weaker.",
		);
	}
	if (normalized.declaredIntent === null) {
		warnings.push(
			"declaredIntent is missing; narrative-to-mechanics traceability is reduced.",
		);
	}
	if (actionDefinition.supportLevel !== "full") {
		warnings.push(
			actionDefinition.supportLevel === "partial"
				? "This action can be scaffolded, but still needs human judgment for final adjudication."
				: "This action is advisory only and should be finalized by the table or GM.",
		);
	}
	if (
		actionDefinition.resolution.mode !== "dice" &&
		normalized.advantage !== null &&
		normalized.advantage !== "none"
	) {
		warnings.push(
			"Advantage was provided, but this action's resolution mode does not use d20-style advantage.",
		);
	}
	if (
		actionDefinition.contested.enabled &&
		normalized.opposedDifficulty === null &&
		normalized.opposedTotal === null &&
		actionDefinition.contested.opponentExpression === null
	) {
		warnings.push(
			"Contested resolution is enabled for this action, but no opponent total, difficulty, or opponent expression is available yet.",
		);
	}
	if (
		actionDefinition.resourceEffects.some(
			(effect) => effect.operation === "spend",
		) &&
		normalized.availableResources === null
	) {
		warnings.push(
			"Resource spends are defined for this action, but no current resource snapshot was provided.",
		);
	}
	return warnings;
}

function validateAgainstActionDefinition(
	rulesetId: string,
	actionTypes: readonly RulesetActionDefinition[],
	input: ResolveMechanicsInput,
): MechanicsValidationResult {
	const actionDefinition = findActionDefinition(actionTypes, input.actionType);
	const normalized = normalizeInput(
		rulesetId,
		actionDefinition ?? {
			id: input.actionType,
			label: input.actionType,
			description: null,
			intents: [],
			supportLevel: "advisory",
			targetDifficulty: {
				required: false,
				min: null,
				max: null,
				default: null,
			},
			modifier: {
				default: 0,
				min: null,
				max: null,
			},
			contested: {
				enabled: false,
				opponentLabel: null,
				opponentExpression: null,
				tieOutcome: null,
			},
			resolution: {
				mode: "advisory",
				expression: null,
				successCondition: null,
				deterministicTotal: null,
				guidance: null,
			},
			outcomeBands: [],
			resourceEffects: [],
			clockEffects: [],
			consequenceChains: [],
		},
		input,
	);

	const errors: string[] = [];
	if (!actionDefinition) {
		errors.push(
			`Unsupported actionType '${input.actionType}' for ${rulesetId}.`,
		);
		return {
			valid: false,
			errors,
			warnings: validationWarnings(
				{
					id: input.actionType,
					label: input.actionType,
					description: null,
					intents: [],
					supportLevel: "advisory",
					targetDifficulty: {
						required: false,
						min: null,
						max: null,
						default: null,
					},
					modifier: {
						default: 0,
						min: null,
						max: null,
					},
					contested: {
						enabled: false,
						opponentLabel: null,
						opponentExpression: null,
						tieOutcome: null,
					},
					resolution: {
						mode: "advisory",
						expression: null,
						successCondition: null,
						deterministicTotal: null,
						guidance: null,
					},
					outcomeBands: [],
					resourceEffects: [],
					clockEffects: [],
					consequenceChains: [],
				},
				normalized,
			),
			normalized,
			supportLevel: "advisory",
			actionDefinition: null,
		};
	}

	if (actionDefinition.targetDifficulty.required) {
		if (normalized.targetDifficulty === null) {
			errors.push(
				`targetDifficulty is required for actionType '${actionDefinition.id}'.`,
			);
		}
	}
	if (normalized.targetDifficulty !== null) {
		if (!Number.isInteger(normalized.targetDifficulty)) {
			errors.push("targetDifficulty must be an integer.");
		}
		if (
			actionDefinition.targetDifficulty.min !== null &&
			normalized.targetDifficulty < actionDefinition.targetDifficulty.min
		) {
			errors.push(
				`targetDifficulty must be at least ${String(actionDefinition.targetDifficulty.min)}.`,
			);
		}
		if (
			actionDefinition.targetDifficulty.max !== null &&
			normalized.targetDifficulty > actionDefinition.targetDifficulty.max
		) {
			errors.push(
				`targetDifficulty must be at most ${String(actionDefinition.targetDifficulty.max)}.`,
			);
		}
	}
	if (!Number.isInteger(normalized.modifier)) {
		errors.push("modifier must be an integer.");
	}
	if (
		actionDefinition.modifier.min !== null &&
		normalized.modifier < actionDefinition.modifier.min
	) {
		errors.push(
			`modifier must be at least ${String(actionDefinition.modifier.min)}.`,
		);
	}
	if (
		actionDefinition.modifier.max !== null &&
		normalized.modifier > actionDefinition.modifier.max
	) {
		errors.push(
			`modifier must be at most ${String(actionDefinition.modifier.max)}.`,
		);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings: validationWarnings(actionDefinition, normalized),
		normalized,
		supportLevel: actionDefinition.supportLevel,
		actionDefinition,
	};
}

function resolveOutcome(args: {
	successCondition: RulesetActionDefinition["resolution"]["successCondition"];
	total: number | null;
	targetDifficulty: number | null;
}): { outcome: "success" | "failure" | null; margin: number | null } {
	if (args.successCondition === "always_success") {
		return { outcome: "success", margin: null };
	}
	if (args.successCondition === "always_failure") {
		return { outcome: "failure", margin: null };
	}
	if (
		args.total === null ||
		args.targetDifficulty === null ||
		args.successCondition === null
	) {
		return { outcome: null, margin: null };
	}
	const margin = args.total - args.targetDifficulty;
	if (args.successCondition === "total_gte_target") {
		return {
			outcome: args.total >= args.targetDifficulty ? "success" : "failure",
			margin,
		};
	}
	if (args.successCondition === "total_lte_target") {
		return {
			outcome: args.total <= args.targetDifficulty ? "success" : "failure",
			margin: args.targetDifficulty - args.total,
		};
	}
	return { outcome: null, margin: null };
}

function resolveComparison(args: {
	actorTotal: number | null;
	opponentTotal: number | null;
}): MechanicsComparison {
	if (args.actorTotal === null || args.opponentTotal === null) {
		return "unresolved";
	}
	if (args.actorTotal > args.opponentTotal) {
		return "actor_wins";
	}
	if (args.actorTotal < args.opponentTotal) {
		return "opponent_wins";
	}
	return "tie";
}

function selectOutcomeBand(args: {
	actionDefinition: RulesetActionDefinition;
	margin: number | null;
	outcome: string | null;
}): RulesetOutcomeBandDefinition | null {
	if (args.actionDefinition.outcomeBands.length === 0) {
		return null;
	}
	const byMargin =
		args.margin === null
			? null
			: (() => {
					const resolvedMargin = args.margin;
					return (
						args.actionDefinition.outcomeBands.find((band) => {
							const minOk =
								band.minMargin === null || resolvedMargin >= band.minMargin;
							const maxOk =
								band.maxMargin === null || resolvedMargin <= band.maxMargin;
							return minOk && maxOk;
						}) ?? null
					);
				})();
	if (byMargin) {
		return byMargin;
	}
	return (
		args.actionDefinition.outcomeBands.find(
			(band) => args.outcome !== null && band.outcome === args.outcome,
		) ?? null
	);
}

type ResolutionConditionContext = {
	outcome: string | null;
	outcomeBandId: string | null;
	comparison: MechanicsComparison | null;
	margin: number | null;
	resources: Record<string, number> | null;
};

function emptyConsequencePlan(): MechanicsResolution["consequencePlan"] {
	return {
		matchedChains: [],
		branchTransitions: [],
		steps: [],
		decisionNodes: [],
	};
}

function cloneResourceSnapshot(
	resources: Record<string, number> | null,
): Record<string, number> | null {
	return resources ? { ...resources } : null;
}

function matchesCondition(args: {
	condition: RulesetConsequenceConditionDefinition | null;
	context: ResolutionConditionContext;
}): boolean {
	const { condition, context } = args;
	if (!condition) {
		return true;
	}
	if (
		condition.onOutcomes.length > 0 &&
		(context.outcome === null || !condition.onOutcomes.includes(context.outcome))
	) {
		return false;
	}
	if (
		condition.onOutcomeBands.length > 0 &&
		(context.outcomeBandId === null ||
			!condition.onOutcomeBands.includes(context.outcomeBandId))
	) {
		return false;
	}
	if (
		condition.onComparisons.length > 0 &&
		(context.comparison === null ||
			!condition.onComparisons.includes(context.comparison))
	) {
		return false;
	}
	if (
		condition.minMargin !== null &&
		(context.margin === null || context.margin < condition.minMargin)
	) {
		return false;
	}
	if (
		condition.maxMargin !== null &&
		(context.margin === null || context.margin > condition.maxMargin)
	) {
		return false;
	}
	if (condition.resourceAtOrBelow) {
		const current = context.resources?.[condition.resourceAtOrBelow.resourceId];
		if (
			typeof current !== "number" ||
			current > condition.resourceAtOrBelow.value
		) {
			return false;
		}
	}
	if (condition.resourceAtOrAbove) {
		const current = context.resources?.[condition.resourceAtOrAbove.resourceId];
		if (
			typeof current !== "number" ||
			current < condition.resourceAtOrAbove.value
		) {
			return false;
		}
	}
	return true;
}

function describeCondition(
	condition: RulesetConsequenceConditionDefinition | null,
): string | null {
	if (!condition) {
		return null;
	}
	const parts: string[] = [];
	if (condition.onOutcomes.length > 0) {
		parts.push(
			condition.onOutcomes.length === 1
				? `outcome ${condition.onOutcomes[0]}`
				: `outcomes ${condition.onOutcomes.join(", ")}`,
		);
	}
	if (condition.onOutcomeBands.length > 0) {
		parts.push(
			condition.onOutcomeBands.length === 1
				? `outcome band ${condition.onOutcomeBands[0]}`
				: `outcome bands ${condition.onOutcomeBands.join(", ")}`,
		);
	}
	if (condition.onComparisons.length > 0) {
		parts.push(
			condition.onComparisons.length === 1
				? `comparison ${condition.onComparisons[0]}`
				: `comparisons ${condition.onComparisons.join(", ")}`,
		);
	}
	if (condition.minMargin !== null || condition.maxMargin !== null) {
		if (
			condition.minMargin !== null &&
			condition.maxMargin !== null &&
			condition.minMargin === condition.maxMargin
		) {
			parts.push(`margin ${String(condition.minMargin)}`);
		} else {
			const range = [
				condition.minMargin !== null ? `>= ${String(condition.minMargin)}` : null,
				condition.maxMargin !== null ? `<= ${String(condition.maxMargin)}` : null,
			]
				.filter(Boolean)
				.join(" and ");
			parts.push(`margin ${range}`);
		}
	}
	if (condition.resourceAtOrBelow) {
		parts.push(
			`${condition.resourceAtOrBelow.resourceId} at or below ${String(condition.resourceAtOrBelow.value)}`,
		);
	}
	if (condition.resourceAtOrAbove) {
		parts.push(
			`${condition.resourceAtOrAbove.resourceId} at or above ${String(condition.resourceAtOrAbove.value)}`,
		);
	}
	if (parts.length === 0) {
		return null;
	}
	return `Matched ${parts.join(" and ")}.`;
}

function applyResourceEffect(args: {
	effect: RulesetResourceEffectDefinition;
	resourceSnapshot: Record<string, number> | null;
}): MechanicsResolution["stateEffects"]["resources"][number] {
	const current = args.resourceSnapshot?.[args.effect.resourceId];
	const balanceAfter =
		current === undefined
			? null
			: args.effect.operation === "spend"
				? current - args.effect.amount
				: args.effect.operation === "gain"
					? current + args.effect.amount
					: args.effect.amount;
	if (args.resourceSnapshot && balanceAfter !== null) {
		args.resourceSnapshot[args.effect.resourceId] = balanceAfter;
	}
	return {
		resourceId: args.effect.resourceId,
		operation: args.effect.operation,
		amount: args.effect.amount,
		balanceAfter,
		guidance: args.effect.guidance,
	};
}

function resourceEffectsForOutcome(args: {
	actionDefinition: RulesetActionDefinition;
	outcome: string | null;
	outcomeBandId: string | null;
	comparison: MechanicsComparison | null;
	margin: number | null;
	resourceSnapshot: Record<string, number> | null;
}): MechanicsResolution["stateEffects"]["resources"] {
	if (args.outcome === null) {
		return [];
	}
	const effects: MechanicsResolution["stateEffects"]["resources"] = [];
	for (const effect of args.actionDefinition.resourceEffects) {
		if (
			effect.onOutcomes.length > 0 &&
			!effect.onOutcomes.includes(args.outcome)
		) {
			continue;
		}
		if (
			!matchesCondition({
				condition: effect.when,
				context: {
					outcome: args.outcome,
					outcomeBandId: args.outcomeBandId,
					comparison: args.comparison,
					margin: args.margin,
					resources: args.resourceSnapshot,
				},
			})
		) {
			continue;
		}
		effects.push(
			applyResourceEffect({
				effect,
				resourceSnapshot: args.resourceSnapshot,
			}),
		);
	}
	return effects;
}

function clockEffectsForOutcome(args: {
	actionDefinition: RulesetActionDefinition;
	outcome: string | null;
	outcomeBandId: string | null;
	comparison: MechanicsComparison | null;
	margin: number | null;
	resourceSnapshot: Record<string, number> | null;
}): MechanicsResolution["stateEffects"]["clocks"] {
	if (args.outcome === null) {
		return [];
	}
	const effects: MechanicsResolution["stateEffects"]["clocks"] = [];
	for (const effect of args.actionDefinition.clockEffects) {
		if (
			effect.onOutcomes.length > 0 &&
			!effect.onOutcomes.includes(args.outcome)
		) {
			continue;
		}
		if (
			!matchesCondition({
				condition: effect.when,
				context: {
					outcome: args.outcome,
					outcomeBandId: args.outcomeBandId,
					comparison: args.comparison,
					margin: args.margin,
					resources: args.resourceSnapshot,
				},
			})
		) {
			continue;
		}
		effects.push({
			clockId: effect.clockId,
			ticks: effect.ticks,
			guidance: effect.guidance,
		});
	}
	return effects;
}

function composeConsequencePlan(args: {
	actionDefinition: RulesetActionDefinition;
	outcome: string | null;
	outcomeBandId: string | null;
	comparison: MechanicsComparison | null;
	margin: number | null;
	resourceSnapshot: Record<string, number> | null;
}): {
	stateEffects: MechanicsResolution["stateEffects"];
	consequencePlan: MechanicsResolution["consequencePlan"];
	requiresHumanJudgment: boolean;
} {
	const consequencePlan = emptyConsequencePlan();
	const resourceSnapshot = cloneResourceSnapshot(args.resourceSnapshot);
	const stateEffects = {
		resources: resourceEffectsForOutcome({
			actionDefinition: args.actionDefinition,
			outcome: args.outcome,
			outcomeBandId: args.outcomeBandId,
			comparison: args.comparison,
			margin: args.margin,
			resourceSnapshot,
		}),
		clocks: clockEffectsForOutcome({
			actionDefinition: args.actionDefinition,
			outcome: args.outcome,
			outcomeBandId: args.outcomeBandId,
			comparison: args.comparison,
			margin: args.margin,
			resourceSnapshot,
		}),
	};
	let requiresHumanJudgment = false;
	const chainById = new Map(
		args.actionDefinition.consequenceChains.map((chain) => [chain.id, chain]),
	);
	const queuedChainIds = new Set<string>();
	const processedChainIds = new Set<string>();
	const queue: Array<{
		chainId: string;
		reason: string | null;
	}> = [];
	const resolutionContext = (): ResolutionConditionContext => ({
		outcome: args.outcome,
		outcomeBandId: args.outcomeBandId,
		comparison: args.comparison,
		margin: args.margin,
		resources: resourceSnapshot,
	});

	const enqueueChain = (chainId: string, reason: string | null) => {
		if (queuedChainIds.has(chainId) || processedChainIds.has(chainId)) {
			return;
		}
		if (!chainById.has(chainId)) {
			return;
		}
		queuedChainIds.add(chainId);
		queue.push({ chainId, reason });
	};

	for (const chain of args.actionDefinition.consequenceChains) {
		if (chain.entrypoint !== "root") {
			continue;
		}
		if (
			!matchesCondition({
				condition: chain.when,
				context: resolutionContext(),
			})
		) {
			continue;
		}
		enqueueChain(chain.id, describeCondition(chain.when));
	}

	while (queue.length > 0) {
		const next = queue.shift();
		if (!next) {
			break;
		}
		queuedChainIds.delete(next.chainId);
		if (processedChainIds.has(next.chainId)) {
			continue;
		}
		const chain = chainById.get(next.chainId);
		if (!chain) {
			continue;
		}
		if (
			!matchesCondition({
				condition: chain.when,
				context: resolutionContext(),
			})
		) {
			continue;
		}
		processedChainIds.add(chain.id);
		consequencePlan.matchedChains.push({
			id: chain.id,
			label: chain.label,
			reason: next.reason,
		});
		for (const [stepIndex, step] of chain.steps.entries()) {
			const stepContext = resolutionContext();
			if (!matchesCondition({ condition: step.when, context: stepContext })) {
				consequencePlan.steps.push({
					chainId: chain.id,
					chainLabel: chain.label,
					stepIndex,
					type: step.type,
					applied: false,
					skippedReason:
						describeCondition(step.when) ?? "Step conditions were not met.",
					guidance: step.guidance,
					resourceId:
						step.type === "resource_effect" ? step.resourceId : null,
					operation:
						step.type === "resource_effect" ? step.operation : null,
					amount:
						step.type === "resource_effect" ? step.amount : null,
					balanceAfter: null,
					clockId: step.type === "clock_effect" ? step.clockId : null,
					ticks: step.type === "clock_effect" ? step.ticks : null,
					decisionId: step.type === "decision_node" ? step.id : null,
					prompt: step.type === "decision_node" ? step.prompt : null,
					options: step.type === "decision_node" ? [...step.options] : [],
					unlockedChainIds: [],
				});
				continue;
			}

			let unlockedChainIds: string[] = [];
			if (step.type === "resource_effect") {
				const appliedEffect = applyResourceEffect({
					effect: step,
					resourceSnapshot,
				});
				stateEffects.resources.push(appliedEffect);
				unlockedChainIds = step.branches
					.filter((branch) =>
						matchesCondition({
							condition: branch.when,
							context: resolutionContext(),
						}),
					)
					.map((branch) => {
						const targetChain = chainById.get(branch.chainId);
						consequencePlan.branchTransitions.push({
							fromChainId: chain.id,
							fromChainLabel: chain.label,
							stepIndex,
							toChainId: branch.chainId,
							toChainLabel: targetChain?.label ?? null,
							guidance: branch.guidance,
						});
						enqueueChain(
							branch.chainId,
							branch.guidance ??
								`Unlocked from ${chain.id} step ${String(stepIndex)}.`,
						);
						return branch.chainId;
					});
				consequencePlan.steps.push({
					chainId: chain.id,
					chainLabel: chain.label,
					stepIndex,
					type: "resource_effect",
					applied: true,
					skippedReason: null,
					guidance: step.guidance,
					resourceId: step.resourceId,
					operation: step.operation,
					amount: step.amount,
					balanceAfter: appliedEffect.balanceAfter,
					clockId: null,
					ticks: null,
					decisionId: null,
					prompt: null,
					options: [],
					unlockedChainIds,
				});
				continue;
			}
			if (step.type === "clock_effect") {
				stateEffects.clocks.push({
					clockId: step.clockId,
					ticks: step.ticks,
					guidance: step.guidance,
				});
				unlockedChainIds = step.branches
					.filter((branch) =>
						matchesCondition({
							condition: branch.when,
							context: resolutionContext(),
						}),
					)
					.map((branch) => {
						const targetChain = chainById.get(branch.chainId);
						consequencePlan.branchTransitions.push({
							fromChainId: chain.id,
							fromChainLabel: chain.label,
							stepIndex,
							toChainId: branch.chainId,
							toChainLabel: targetChain?.label ?? null,
							guidance: branch.guidance,
						});
						enqueueChain(
							branch.chainId,
							branch.guidance ??
								`Unlocked from ${chain.id} step ${String(stepIndex)}.`,
						);
						return branch.chainId;
					});
				consequencePlan.steps.push({
					chainId: chain.id,
					chainLabel: chain.label,
					stepIndex,
					type: "clock_effect",
					applied: true,
					skippedReason: null,
					guidance: step.guidance,
					resourceId: null,
					operation: null,
					amount: null,
					balanceAfter: null,
					clockId: step.clockId,
					ticks: step.ticks,
					decisionId: null,
					prompt: null,
					options: [],
					unlockedChainIds,
				});
				continue;
			}
			const decisionNode: MechanicsDecisionNodeResolution = {
				id: step.id,
				kind: step.kind,
				prompt: step.prompt,
				options: [...step.options],
				guidance: step.guidance,
				chainId: chain.id,
				chainLabel: chain.label,
				stepIndex,
			};
			requiresHumanJudgment = true;
			consequencePlan.decisionNodes.push(decisionNode);
			unlockedChainIds = step.branches
				.filter((branch) =>
					matchesCondition({
						condition: branch.when,
						context: resolutionContext(),
					}),
				)
				.map((branch) => {
					const targetChain = chainById.get(branch.chainId);
					consequencePlan.branchTransitions.push({
						fromChainId: chain.id,
						fromChainLabel: chain.label,
						stepIndex,
						toChainId: branch.chainId,
						toChainLabel: targetChain?.label ?? null,
						guidance: branch.guidance,
					});
					enqueueChain(
						branch.chainId,
						branch.guidance ??
							`Unlocked from ${chain.id} step ${String(stepIndex)}.`,
					);
					return branch.chainId;
				});
			consequencePlan.steps.push({
				chainId: chain.id,
				chainLabel: chain.label,
				stepIndex,
				type: "decision_node",
				applied: true,
				skippedReason: null,
				guidance: step.guidance,
				resourceId: null,
				operation: null,
				amount: null,
				balanceAfter: null,
				clockId: null,
				ticks: null,
				decisionId: step.id,
				prompt: step.prompt,
				options: [...step.options],
				unlockedChainIds,
			});
		}
	}

	return {
		stateEffects,
		consequencePlan,
		requiresHumanJudgment,
	};
}

function affordabilityWarnings(args: {
	actionDefinition: RulesetActionDefinition;
	outcome: string | null;
	outcomeBandId: string | null;
	comparison: MechanicsComparison | null;
	margin: number | null;
	availableResources: Record<string, number> | null;
}): string[] {
	if (args.availableResources === null || args.outcome === null) {
		return [];
	}
	const warnings: string[] = [];
	const resourceSnapshot = cloneResourceSnapshot(args.availableResources);
	const pushOverspendWarning = (effect: {
		resourceId: string;
		amount: number;
		operation: "spend" | "gain" | "set";
	}) => {
		if (effect.operation !== "spend") {
			return;
		}
		const current = resourceSnapshot?.[effect.resourceId];
		if (typeof current === "number" && current < effect.amount) {
			warnings.push(
				`Resource '${effect.resourceId}' may be overspent (${String(current)} available, ${String(effect.amount)} required).`,
			);
		}
	};
	for (const effect of args.actionDefinition.resourceEffects) {
		if (
			(effect.onOutcomes.length > 0 && !effect.onOutcomes.includes(args.outcome)) ||
			!matchesCondition({
				condition: effect.when,
				context: {
					outcome: args.outcome,
					outcomeBandId: args.outcomeBandId,
					comparison: args.comparison,
					margin: args.margin,
					resources: resourceSnapshot,
				},
			})
		) {
			continue;
		}
		pushOverspendWarning(effect);
		applyResourceEffect({ effect, resourceSnapshot });
	}
	for (const chain of args.actionDefinition.consequenceChains) {
		if (
			!matchesCondition({
				condition: chain.when,
				context: {
					outcome: args.outcome,
					outcomeBandId: args.outcomeBandId,
					comparison: args.comparison,
					margin: args.margin,
					resources: resourceSnapshot,
				},
			})
		) {
			continue;
		}
		for (const step of chain.steps) {
			if (step.type !== "resource_effect") {
				continue;
			}
			if (
				(step.onOutcomes.length > 0 && !step.onOutcomes.includes(args.outcome)) ||
				!matchesCondition({
					condition: step.when,
					context: {
						outcome: args.outcome,
						outcomeBandId: args.outcomeBandId,
						comparison: args.comparison,
						margin: args.margin,
						resources: resourceSnapshot,
					},
				})
			) {
				continue;
			}
			pushOverspendWarning(step);
			applyResourceEffect({ effect: step, resourceSnapshot });
		}
	}
	return warnings;
}

function renderDiceExpression(
	expressionTemplate: string,
	input: MechanicsValidationInput,
): string {
	return expressionTemplate
		.replaceAll(/\{modifier\}/g, String(input.modifier))
		.replaceAll(/\{opposedModifier\}/g, String(input.opposedModifier))
		.replaceAll(/\+\s*-/g, "-")
		.replaceAll(/-\s*-/g, "+")
		.replaceAll(/\s+/g, "");
}

function supportsAdvantage(expression: string): boolean {
	return /^1d20(?:[+-]\d+)?$/i.test(expression.trim());
}

function resolveContested(args: {
	actionDefinition: RulesetActionDefinition;
	normalized: MechanicsValidationInput;
	actorTotal: number | null;
}): MechanicsResolution["contested"] {
	if (!args.actionDefinition.contested.enabled) {
		return null;
	}
	const opponentExpression = args.actionDefinition.contested.opponentExpression
		? renderDiceExpression(
				args.actionDefinition.contested.opponentExpression,
				args.normalized,
			)
		: null;
	const opponentRoll =
		opponentExpression !== null
			? rollDiceExpression({ expression: opponentExpression })
			: null;
	const opponentTotal =
		args.normalized.opposedTotal ??
		opponentRoll?.total ??
		args.normalized.opposedDifficulty;
	return {
		enabled: true,
		opponentLabel: args.actionDefinition.contested.opponentLabel,
		opponentRolls: opponentRoll?.rolls ?? [],
		opponentTotal,
		comparison: resolveComparison({
			actorTotal: args.actorTotal,
			opponentTotal,
		}),
	};
}

function resolveFromActionDefinition(
	validation: MechanicsValidationResult,
): MechanicsResolution {
	const actionDefinition = validation.actionDefinition;
	if (!validation.valid || !actionDefinition) {
		return {
			actionType: validation.normalized.actionType,
			targetDifficulty: validation.normalized.targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: validation.normalized.advantage,
			rawRoll: null,
			rolls: [],
			total: null,
			outcome: null,
			margin: null,
			outcomeBand: null,
			contested: null,
			stateEffects: {
				resources: [],
				clocks: [],
			},
			consequencePlan: emptyConsequencePlan(),
			resolutionMode: "unsupported",
			supportLevel: validation.supportLevel,
			requiresHumanJudgment: true,
			unsupportedReason: validation.errors.join("; "),
			trace: {
				validationErrors: validation.errors,
				validationWarnings: validation.warnings,
			},
		};
	}

	if (actionDefinition.resolution.mode === "advisory") {
		return {
			actionType: actionDefinition.id,
			targetDifficulty: validation.normalized.targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: null,
			rawRoll: null,
			rolls: [],
			total: null,
			outcome: null,
			margin: null,
			outcomeBand: null,
			contested: null,
			stateEffects: {
				resources: [],
				clocks: [],
			},
			consequencePlan: emptyConsequencePlan(),
			resolutionMode: "advisory",
			supportLevel: actionDefinition.supportLevel,
			requiresHumanJudgment: true,
			unsupportedReason: null,
			trace: {
				guidance:
					actionDefinition.resolution.guidance ??
					"This action requires table judgment.",
				validationWarnings: validation.warnings,
			},
		};
	}

	if (actionDefinition.resolution.mode === "partial") {
		return {
			actionType: actionDefinition.id,
			targetDifficulty: validation.normalized.targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: null,
			rawRoll: null,
			rolls: [],
			total: null,
			outcome: null,
			margin: null,
			outcomeBand: null,
			contested: null,
			stateEffects: {
				resources: [],
				clocks: [],
			},
			consequencePlan: emptyConsequencePlan(),
			resolutionMode: "partial",
			supportLevel: actionDefinition.supportLevel,
			requiresHumanJudgment: true,
			unsupportedReason: null,
			trace: {
				guidance:
					actionDefinition.resolution.guidance ??
					"Bardo can scaffold this action, but final resolution still needs human judgment.",
				validationWarnings: validation.warnings,
			},
		};
	}

	if (actionDefinition.resolution.mode === "deterministic") {
		const total =
			(actionDefinition.resolution.deterministicTotal ?? 10) +
			validation.normalized.modifier;
		const { outcome, margin } = resolveOutcome({
			successCondition: actionDefinition.resolution.successCondition,
			total,
			targetDifficulty: validation.normalized.targetDifficulty,
		});
		const contested = resolveContested({
			actionDefinition,
			normalized: validation.normalized,
			actorTotal: total,
		});
		const contestedMargin =
			contested?.opponentTotal !== null && contested?.opponentTotal !== undefined
				? total - contested.opponentTotal
				: margin;
		const contestedOutcome =
			contested === null
				? outcome
				: contested.comparison === "actor_wins"
					? "success"
					: contested.comparison === "opponent_wins"
						? "failure"
						: contested.comparison === "tie"
							? actionDefinition.contested.tieOutcome ?? "mixed"
							: outcome;
		const outcomeBand = selectOutcomeBand({
			actionDefinition,
			margin: contestedMargin,
			outcome: contestedOutcome,
		});
		const resolvedOutcome = outcomeBand?.outcome ?? contestedOutcome;
		const resourceWarnings = affordabilityWarnings({
			actionDefinition,
			outcome: resolvedOutcome,
			outcomeBandId: outcomeBand?.id ?? null,
			comparison: contested?.comparison ?? null,
			margin: contestedMargin,
			availableResources: validation.normalized.availableResources,
		});
		const composedConsequences = composeConsequencePlan({
			actionDefinition,
			outcome: resolvedOutcome,
			outcomeBandId: outcomeBand?.id ?? null,
			comparison: contested?.comparison ?? null,
			margin: contestedMargin,
			resourceSnapshot: validation.normalized.availableResources,
		});
		return {
			actionType: actionDefinition.id,
			targetDifficulty: validation.normalized.targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: null,
			rawRoll: null,
			rolls: [],
			total,
			outcome: resolvedOutcome,
			margin: contestedMargin,
			outcomeBand: outcomeBand
				? {
						id: outcomeBand.id,
						label: outcomeBand.label,
						guidance: outcomeBand.guidance,
					}
				: null,
			contested,
			stateEffects: composedConsequences.stateEffects,
			consequencePlan: composedConsequences.consequencePlan,
			resolutionMode: "deterministic",
			supportLevel: actionDefinition.supportLevel,
			requiresHumanJudgment:
				actionDefinition.supportLevel !== "full" ||
				resourceWarnings.length > 0 ||
				composedConsequences.requiresHumanJudgment,
			unsupportedReason: null,
			trace: {
				model: "workspace_deterministic",
				guidance: actionDefinition.resolution.guidance,
				outcomeBandId: outcomeBand?.id ?? null,
				contested,
				stateEffects: composedConsequences.stateEffects,
				consequencePlan: composedConsequences.consequencePlan,
				validationWarnings: validation.warnings,
				resourceWarnings,
			},
		};
	}

	const expressionTemplate =
		actionDefinition.resolution.expression ?? "1d20+{modifier}";
	const expression = renderDiceExpression(expressionTemplate, validation.normalized);
	if (
		validation.normalized.advantage &&
		validation.normalized.advantage !== "none" &&
		supportsAdvantage(expression)
	) {
		const roll = rollD20Check({
			modifier: validation.normalized.modifier,
			advantage: validation.normalized.advantage,
		});
		const { outcome, margin } = resolveOutcome({
			successCondition: actionDefinition.resolution.successCondition,
			total: roll.total,
			targetDifficulty: validation.normalized.targetDifficulty,
		});
		const contested = resolveContested({
			actionDefinition,
			normalized: validation.normalized,
			actorTotal: roll.total,
		});
		const contestedMargin =
			contested?.opponentTotal !== null && contested?.opponentTotal !== undefined
				? roll.total - contested.opponentTotal
				: margin;
		const contestedOutcome =
			contested === null
				? outcome
				: contested.comparison === "actor_wins"
					? "success"
					: contested.comparison === "opponent_wins"
						? "failure"
						: contested.comparison === "tie"
							? actionDefinition.contested.tieOutcome ?? "mixed"
							: outcome;
		const outcomeBand = selectOutcomeBand({
			actionDefinition,
			margin: contestedMargin,
			outcome: contestedOutcome,
		});
		const resolvedOutcome = outcomeBand?.outcome ?? contestedOutcome;
		const resourceWarnings = affordabilityWarnings({
			actionDefinition,
			outcome: resolvedOutcome,
			outcomeBandId: outcomeBand?.id ?? null,
			comparison: contested?.comparison ?? null,
			margin: contestedMargin,
			availableResources: validation.normalized.availableResources,
		});
		const composedConsequences = composeConsequencePlan({
			actionDefinition,
			outcome: resolvedOutcome,
			outcomeBandId: outcomeBand?.id ?? null,
			comparison: contested?.comparison ?? null,
			margin: contestedMargin,
			resourceSnapshot: validation.normalized.availableResources,
		});
		return {
			actionType: actionDefinition.id,
			targetDifficulty: validation.normalized.targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: validation.normalized.advantage,
			rawRoll: roll.selectedRoll,
			rolls: roll.rolls,
			total: roll.total,
			outcome: resolvedOutcome,
			margin: contestedMargin,
			outcomeBand: outcomeBand
				? {
						id: outcomeBand.id,
						label: outcomeBand.label,
						guidance: outcomeBand.guidance,
					}
				: null,
			contested,
			stateEffects: composedConsequences.stateEffects,
			consequencePlan: composedConsequences.consequencePlan,
			resolutionMode: "dice",
			supportLevel: actionDefinition.supportLevel,
			requiresHumanJudgment:
				actionDefinition.supportLevel !== "full" ||
				resourceWarnings.length > 0 ||
				composedConsequences.requiresHumanJudgment,
			unsupportedReason: null,
			trace: {
				rollType: "d20_check",
				expression,
				guidance: actionDefinition.resolution.guidance,
				outcomeBandId: outcomeBand?.id ?? null,
				contested,
				stateEffects: composedConsequences.stateEffects,
				consequencePlan: composedConsequences.consequencePlan,
				validationWarnings: validation.warnings,
				resourceWarnings,
			},
		};
	}

	const roll = rollDiceExpression({ expression });
	const { outcome, margin } = resolveOutcome({
		successCondition: actionDefinition.resolution.successCondition,
		total: roll.total,
		targetDifficulty: validation.normalized.targetDifficulty,
	});
	const contested = resolveContested({
		actionDefinition,
		normalized: validation.normalized,
		actorTotal: roll.total,
	});
	const contestedMargin =
		contested?.opponentTotal !== null && contested?.opponentTotal !== undefined
			? roll.total - contested.opponentTotal
			: margin;
	const contestedOutcome =
		contested === null
			? outcome
			: contested.comparison === "actor_wins"
				? "success"
				: contested.comparison === "opponent_wins"
					? "failure"
					: contested.comparison === "tie"
						? actionDefinition.contested.tieOutcome ?? "mixed"
						: outcome;
	const outcomeBand = selectOutcomeBand({
		actionDefinition,
		margin: contestedMargin,
		outcome: contestedOutcome,
	});
	const resolvedOutcome = outcomeBand?.outcome ?? contestedOutcome;
	const resourceWarnings = affordabilityWarnings({
		actionDefinition,
		outcome: resolvedOutcome,
		outcomeBandId: outcomeBand?.id ?? null,
		comparison: contested?.comparison ?? null,
		margin: contestedMargin,
		availableResources: validation.normalized.availableResources,
	});
	const composedConsequences = composeConsequencePlan({
		actionDefinition,
		outcome: resolvedOutcome,
		outcomeBandId: outcomeBand?.id ?? null,
		comparison: contested?.comparison ?? null,
		margin: contestedMargin,
		resourceSnapshot: validation.normalized.availableResources,
	});
	return {
		actionType: actionDefinition.id,
		targetDifficulty: validation.normalized.targetDifficulty,
		modifier: validation.normalized.modifier,
		advantage:
			supportsAdvantage(expression) && validation.normalized.advantage
				? validation.normalized.advantage
				: null,
		rawRoll: null,
		rolls: roll.rolls,
		total: roll.total,
		outcome: resolvedOutcome,
		margin: contestedMargin,
		outcomeBand: outcomeBand
			? {
					id: outcomeBand.id,
					label: outcomeBand.label,
					guidance: outcomeBand.guidance,
				}
			: null,
		contested,
		stateEffects: composedConsequences.stateEffects,
		consequencePlan: composedConsequences.consequencePlan,
		resolutionMode: "dice",
		supportLevel: actionDefinition.supportLevel,
		requiresHumanJudgment:
			actionDefinition.supportLevel !== "full" ||
			resourceWarnings.length > 0 ||
			composedConsequences.requiresHumanJudgment,
		unsupportedReason: null,
		trace: {
			rollType: "expression",
			expression,
			minPossible: roll.minPossible,
			maxPossible: roll.maxPossible,
			guidance: actionDefinition.resolution.guidance,
			outcomeBandId: outcomeBand?.id ?? null,
			contested,
			stateEffects: composedConsequences.stateEffects,
			consequencePlan: composedConsequences.consequencePlan,
			validationWarnings: validation.warnings,
			resourceWarnings,
		},
	};
}

export function buildWorkspaceRulesetAdapter(
	entry: RulesetCatalogEntry,
): RulesetAdapter {
	const actionTypes = [...entry.actionTypes];
	const supportedActionTypes = actionTypes.map((action) => action.id);
	return {
		id: entry.id,
		title: entry.title,
		sourceType: entry.sourceType,
		capabilities: entry.capabilities,
		actionTypes,
		supportedActionTypes,
		validate(input: ResolveMechanicsInput): MechanicsValidationResult {
			return validateAgainstActionDefinition(entry.id, actionTypes, input);
		},
		resolve(input: ResolveMechanicsInput): MechanicsResolution {
			const validation = validateAgainstActionDefinition(
				entry.id,
				actionTypes,
				input,
			);
			return resolveFromActionDefinition(validation);
		},
		resolveActionTypeForIntent(intent: string): MechanicsActionType | null {
			const normalizedIntent = canonicalIntent(intent);
			const match = actionTypes
				.filter((action) =>
					action.intents.some(
						(candidate) => canonicalIntent(candidate) === normalizedIntent,
					),
				)
				.sort((left, right) => supportRank(right.supportLevel) - supportRank(left.supportLevel))[0];
			return match?.id ?? null;
		},
	};
}

export function loadWorkspaceRulesetEntries(
	bardoRoot: string | undefined,
): RulesetCatalogEntry[] {
	if (!bardoRoot) {
		return [];
	}
	return readWorkspaceManifestEntries(bardoRoot);
}
