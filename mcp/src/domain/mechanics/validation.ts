import { resolveRulesetAdapter } from "./rulesets/registry";
import type {
	MechanicsActionType,
	MechanicsValidationInput,
	MechanicsValidationResult,
	ResolveMechanicsInput,
} from "./rulesets/types";

export type {
	MechanicsActionType,
	MechanicsValidationInput,
	MechanicsValidationResult,
} from "./rulesets/types";

export function validateActionAgainstRuleset(args: {
	ruleset: string;
	actionType: MechanicsActionType;
	targetDifficulty?: number;
	modifier?: number;
	actorId?: string;
	declaredIntent?: string;
	advantage?: "none" | "advantage" | "disadvantage";
}): MechanicsValidationResult {
	const adapter = resolveRulesetAdapter(args.ruleset);
	const input: ResolveMechanicsInput = {
		actionType: args.actionType,
		targetDifficulty: args.targetDifficulty,
		modifier: args.modifier,
		actorId: args.actorId,
		declaredIntent: args.declaredIntent,
		advantage: args.advantage,
	};
	const result = adapter.validate(input);
	const normalized: MechanicsValidationInput = {
		...result.normalized,
		ruleset: adapter.id,
	};
	return {
		...result,
		normalized,
	};
}
