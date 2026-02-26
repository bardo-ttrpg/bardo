import { type AdvantageMode, rollD20Check } from "../dice";
import type {
	MechanicsValidationInput,
	MechanicsValidationResult,
	ResolveMechanicsInput,
	RulesetAdapter,
} from "./types";

const SUPPORTED_ACTION_TYPES = [
	"skill_check",
	"attack_roll",
	"saving_throw",
] as const;

function normalize(input: ResolveMechanicsInput): MechanicsValidationInput {
	return {
		ruleset: "d20_v1",
		actionType: input.actionType,
		targetDifficulty:
			typeof input.targetDifficulty === "number"
				? input.targetDifficulty
				: null,
		modifier: typeof input.modifier === "number" ? input.modifier : 0,
		actorId:
			typeof input.actorId === "string" && input.actorId.trim().length > 0
				? input.actorId.trim()
				: null,
		declaredIntent:
			typeof input.declaredIntent === "string" &&
			input.declaredIntent.trim().length > 0
				? input.declaredIntent.trim()
				: null,
		advantage: input.advantage ?? "none",
	};
}

function validate(input: ResolveMechanicsInput): MechanicsValidationResult {
	const normalized = normalize(input);
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!SUPPORTED_ACTION_TYPES.includes(normalized.actionType as never)) {
		errors.push(
			`Unsupported actionType '${normalized.actionType}' for d20_v1. Supported: ${SUPPORTED_ACTION_TYPES.join(", ")}.`,
		);
	}

	if (normalized.targetDifficulty === null) {
		errors.push("targetDifficulty is required for d20_v1 resolution.");
	} else if (
		!Number.isInteger(normalized.targetDifficulty) ||
		normalized.targetDifficulty < 1 ||
		normalized.targetDifficulty > 40
	) {
		errors.push("targetDifficulty must be an integer between 1 and 40.");
	}

	if (!Number.isInteger(normalized.modifier)) {
		errors.push("modifier must be an integer.");
	} else if (normalized.modifier < -20 || normalized.modifier > 20) {
		errors.push("modifier must be between -20 and 20.");
	}

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

	if (
		normalized.actionType === "attack_roll" &&
		normalized.targetDifficulty !== null &&
		normalized.targetDifficulty > 30
	) {
		warnings.push(
			"targetDifficulty above 30 is unusual for d20_v1 attack rolls.",
		);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		normalized,
	};
}

export const d20v1RulesetAdapter: RulesetAdapter = {
	id: "d20_v1",
	supportedActionTypes: SUPPORTED_ACTION_TYPES,
	capabilities: {
		contested: false,
		conditions: true,
		initiative: true,
		interrupts: false,
		resourceTracking: true,
	},
	validate,
	resolve(input) {
		const validation = validate(input);
		if (!validation.valid) {
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
				resolutionMode: "unsupported",
				unsupportedReason: validation.errors.join("; "),
				trace: {
					validationErrors: validation.errors,
					validationWarnings: validation.warnings,
				},
			};
		}

		const advantage = (validation.normalized.advantage ??
			"none") as AdvantageMode;
		const roll = rollD20Check({
			modifier: validation.normalized.modifier,
			advantage,
		});
		const targetDifficulty = validation.normalized.targetDifficulty ?? 10;
		const outcome = roll.total >= targetDifficulty ? "success" : "failure";
		const margin = roll.total - targetDifficulty;

		return {
			actionType: validation.normalized.actionType,
			targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage,
			rawRoll: roll.selectedRoll,
			rolls: roll.rolls,
			total: roll.total,
			outcome,
			margin,
			resolutionMode: "dice",
			unsupportedReason: null,
			trace: {
				rollType: "d20_check",
				validationWarnings: validation.warnings,
			},
		};
	},
};
