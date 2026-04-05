import type { AdvantageMode } from "../dice";

export type MechanicsRulesetId = string;
export type MechanicsActionType = string;
export type MechanicsSupportLevel = "full" | "partial" | "advisory";
export type MechanicsResolutionMode =
	| "dice"
	| "deterministic"
	| "partial"
	| "advisory"
	| "unsupported";
export type RulesetSourceType = "builtin" | "workspace";
export type MechanicsSuccessCondition =
	| "total_gte_target"
	| "total_lte_target"
	| "always_success"
	| "always_failure";
export type MechanicsComparison =
	| "actor_wins"
	| "opponent_wins"
	| "tie"
	| "unresolved";

export type RulesetConsequenceConditionDefinition = {
	onOutcomes: string[];
	onOutcomeBands: string[];
	onComparisons: MechanicsComparison[];
	minMargin: number | null;
	maxMargin: number | null;
	resourceAtOrBelow: {
		resourceId: string;
		value: number;
	} | null;
	resourceAtOrAbove: {
		resourceId: string;
		value: number;
	} | null;
};

export type RulesetDecisionNodeDefinition = {
	id: string;
	kind: "ask_the_table";
	prompt: string;
	options: string[];
	guidance: string | null;
};

export type RulesetConsequenceBranchDefinition = {
	chainId: string;
	when: RulesetConsequenceConditionDefinition | null;
	guidance: string | null;
};

export type RulesetResourceEffectDefinition = {
	resourceId: string;
	operation: "spend" | "gain" | "set";
	amount: number;
	onOutcomes: string[];
	when: RulesetConsequenceConditionDefinition | null;
	guidance: string | null;
};

export type RulesetClockEffectDefinition = {
	clockId: string;
	ticks: number;
	onOutcomes: string[];
	when: RulesetConsequenceConditionDefinition | null;
	guidance: string | null;
};

export type RulesetConsequenceStepDefinition =
	| ({
			type: "resource_effect";
			when: RulesetConsequenceConditionDefinition | null;
			branches: readonly RulesetConsequenceBranchDefinition[];
	  } & RulesetResourceEffectDefinition)
	| ({
			type: "clock_effect";
			when: RulesetConsequenceConditionDefinition | null;
			branches: readonly RulesetConsequenceBranchDefinition[];
	  } & RulesetClockEffectDefinition)
	| ({
			type: "decision_node";
			when: RulesetConsequenceConditionDefinition | null;
			branches: readonly RulesetConsequenceBranchDefinition[];
	  } & RulesetDecisionNodeDefinition);

export type RulesetConsequenceChainDefinition = {
	id: string;
	label: string;
	entrypoint: "root" | "branch";
	when: RulesetConsequenceConditionDefinition | null;
	steps: readonly RulesetConsequenceStepDefinition[];
};

export type MechanicsDecisionNodeResolution = {
	id: string;
	kind: "ask_the_table";
	prompt: string;
	options: string[];
	guidance: string | null;
	chainId: string;
	chainLabel: string;
	stepIndex: number;
};

export type MechanicsConsequenceStepResolution = {
	chainId: string;
	chainLabel: string;
	stepIndex: number;
	type: "resource_effect" | "clock_effect" | "decision_node";
	applied: boolean;
	skippedReason: string | null;
	guidance: string | null;
	resourceId: string | null;
	operation: "spend" | "gain" | "set" | null;
	amount: number | null;
	balanceAfter: number | null;
	clockId: string | null;
	ticks: number | null;
	decisionId: string | null;
	prompt: string | null;
	options: string[];
	unlockedChainIds: string[];
};

export type MechanicsValidationInput = {
	ruleset: MechanicsRulesetId;
	actionType: MechanicsActionType;
	targetDifficulty: number | null;
	modifier: number;
	opposedDifficulty: number | null;
	opposedModifier: number;
	opposedTotal: number | null;
	actorId: string | null;
	declaredIntent: string | null;
	advantage: AdvantageMode | null;
	availableResources: Record<string, number> | null;
};

export type MechanicsValidationResult = {
	valid: boolean;
	errors: string[];
	warnings: string[];
	normalized: MechanicsValidationInput;
	supportLevel: MechanicsSupportLevel;
	actionDefinition: RulesetActionDefinition | null;
};

export type MechanicsResolution = {
	actionType: MechanicsActionType;
	targetDifficulty: number | null;
	modifier: number;
	advantage: AdvantageMode | null;
	rawRoll: number | null;
	rolls: number[];
	total: number | null;
	outcome: string | null;
	margin: number | null;
	outcomeBand: {
		id: string;
		label: string;
		guidance: string | null;
	} | null;
	contested: {
		enabled: boolean;
		opponentLabel: string | null;
		opponentRolls: number[];
		opponentTotal: number | null;
		comparison: MechanicsComparison;
	} | null;
	stateEffects: {
		resources: Array<{
			resourceId: string;
			operation: "spend" | "gain" | "set";
			amount: number;
			balanceAfter: number | null;
			guidance: string | null;
		}>;
		clocks: Array<{
			clockId: string;
			ticks: number;
			guidance: string | null;
			}>;
		};
	consequencePlan: {
		matchedChains: Array<{
			id: string;
			label: string;
			reason: string | null;
		}>;
		branchTransitions: Array<{
			fromChainId: string;
			fromChainLabel: string;
			stepIndex: number;
			toChainId: string;
			toChainLabel: string | null;
			guidance: string | null;
		}>;
		steps: MechanicsConsequenceStepResolution[];
		decisionNodes: MechanicsDecisionNodeResolution[];
	};
	resolutionMode: MechanicsResolutionMode;
	supportLevel: MechanicsSupportLevel;
	requiresHumanJudgment: boolean;
	unsupportedReason: string | null;
	trace: Record<string, unknown>;
};

export type RulesetCapabilities = {
	contested: boolean;
	conditions: boolean;
	initiative: boolean;
	interrupts: boolean;
	resourceTracking: boolean;
};

export type ResolveMechanicsInput = {
	actionType: MechanicsActionType;
	targetDifficulty?: number;
	modifier?: number;
	opposedDifficulty?: number;
	opposedModifier?: number;
	opposedTotal?: number;
	advantage?: AdvantageMode;
	actorId?: string;
	declaredIntent?: string;
	availableResources?: Record<string, number>;
};

export type RulesetOutcomeBandDefinition = {
	id: string;
	label: string;
	outcome: string;
	minMargin: number | null;
	maxMargin: number | null;
	guidance: string | null;
};

export type RulesetActionDefinition = {
	id: MechanicsActionType;
	label: string;
	description: string | null;
	intents: string[];
	supportLevel: MechanicsSupportLevel;
	targetDifficulty: {
		required: boolean;
		min: number | null;
		max: number | null;
		default: number | null;
	};
	modifier: {
		default: number;
		min: number | null;
		max: number | null;
	};
	contested: {
		enabled: boolean;
		opponentLabel: string | null;
		opponentExpression: string | null;
		tieOutcome: string | null;
	};
	resolution: {
		mode: Exclude<MechanicsResolutionMode, "unsupported">;
		expression: string | null;
		successCondition: MechanicsSuccessCondition | null;
		deterministicTotal: number | null;
		guidance: string | null;
	};
	outcomeBands: readonly RulesetOutcomeBandDefinition[];
	resourceEffects: readonly RulesetResourceEffectDefinition[];
	clockEffects: readonly RulesetClockEffectDefinition[];
	consequenceChains: readonly RulesetConsequenceChainDefinition[];
};

export type RulesetCatalogEntry = {
	id: MechanicsRulesetId;
	title: string;
	sourceType: RulesetSourceType;
	capabilities: RulesetCapabilities;
	actionTypes: readonly RulesetActionDefinition[];
};

export type RulesetCatalog = {
	rulesets: readonly RulesetCatalogEntry[];
};

export interface RulesetAdapter {
	id: MechanicsRulesetId;
	title: string;
	sourceType: RulesetSourceType;
	supportedActionTypes: readonly MechanicsActionType[];
	capabilities: RulesetCapabilities;
	actionTypes: readonly RulesetActionDefinition[];
	validate(input: ResolveMechanicsInput): MechanicsValidationResult;
	resolve(input: ResolveMechanicsInput): MechanicsResolution;
	resolveActionTypeForIntent?(intent: string): MechanicsActionType | null;
}
