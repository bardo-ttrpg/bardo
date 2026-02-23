import type { AdvantageMode } from "../dice";

export type MechanicsRulesetId = string;
export type MechanicsActionType = string;

export type MechanicsValidationInput = {
	ruleset: MechanicsRulesetId;
	actionType: MechanicsActionType;
	targetDifficulty: number | null;
	modifier: number;
	actorId: string | null;
	declaredIntent: string | null;
	advantage: AdvantageMode | null;
};

export type MechanicsValidationResult = {
	valid: boolean;
	errors: string[];
	warnings: string[];
	normalized: MechanicsValidationInput;
};

export type MechanicsResolution = {
	actionType: MechanicsActionType;
	targetDifficulty: number | null;
	modifier: number;
	advantage: AdvantageMode | null;
	rawRoll: number | null;
	rolls: number[];
	total: number | null;
	outcome: "success" | "failure" | null;
	margin: number | null;
	resolutionMode: "dice" | "deterministic" | "unsupported";
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
	advantage?: AdvantageMode;
	actorId?: string;
	declaredIntent?: string;
};

export interface RulesetAdapter {
	id: MechanicsRulesetId;
	supportedActionTypes: readonly MechanicsActionType[];
	capabilities: RulesetCapabilities;
	validate(input: ResolveMechanicsInput): MechanicsValidationResult;
	resolve(input: ResolveMechanicsInput): MechanicsResolution;
}
