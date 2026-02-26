import type {
	MechanicsValidationInput,
	MechanicsValidationResult,
	ResolveMechanicsInput,
	RulesetAdapter,
} from "./types";

const SUPPORTED_ACTION_TYPES = [
	"narrative_check",
	"social_check",
	"exploration_check",
] as const;

function normalize(input: ResolveMechanicsInput): MechanicsValidationInput {
	return {
		ruleset: "narrative_v1",
		actionType: input.actionType,
		targetDifficulty:
			typeof input.targetDifficulty === "number" ? input.targetDifficulty : 10,
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
		advantage: null,
	};
}

function validate(input: ResolveMechanicsInput): MechanicsValidationResult {
	const normalized = normalize(input);
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!SUPPORTED_ACTION_TYPES.includes(normalized.actionType as never)) {
		errors.push(
			`Unsupported actionType '${normalized.actionType}' for narrative_v1. Supported: ${SUPPORTED_ACTION_TYPES.join(", ")}.`,
		);
	}

	if (normalized.targetDifficulty !== null) {
		if (
			!Number.isInteger(normalized.targetDifficulty) ||
			normalized.targetDifficulty < 1 ||
			normalized.targetDifficulty > 40
		) {
			errors.push("targetDifficulty must be an integer between 1 and 40.");
		}
	}

	if (!Number.isInteger(normalized.modifier)) {
		errors.push("modifier must be an integer.");
	}

	if (normalized.actorId === null) {
		warnings.push(
			"actorId is missing; auditability for this action will be weaker.",
		);
	}

	return {
		valid: errors.length === 0,
		errors,
		warnings,
		normalized,
	};
}

export const narrativeV1RulesetAdapter: RulesetAdapter = {
	id: "narrative_v1",
	supportedActionTypes: SUPPORTED_ACTION_TYPES,
	capabilities: {
		contested: false,
		conditions: false,
		initiative: false,
		interrupts: false,
		resourceTracking: false,
	},
	validate,
	resolve(input) {
		const validation = validate(input);
		if (!validation.valid) {
			return {
				actionType: validation.normalized.actionType,
				targetDifficulty: validation.normalized.targetDifficulty,
				modifier: validation.normalized.modifier,
				advantage: null,
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

		const targetDifficulty = validation.normalized.targetDifficulty ?? 10;
		const total = validation.normalized.modifier + 10;
		const outcome = total >= targetDifficulty ? "success" : "failure";

		return {
			actionType: validation.normalized.actionType,
			targetDifficulty,
			modifier: validation.normalized.modifier,
			advantage: null,
			rawRoll: null,
			rolls: [],
			total,
			outcome,
			margin: total - targetDifficulty,
			resolutionMode: "deterministic",
			unsupportedReason: null,
			trace: {
				model: "narrative_v1_deterministic",
				validationWarnings: validation.warnings,
			},
		};
	},
};
