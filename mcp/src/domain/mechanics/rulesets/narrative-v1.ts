import type {
	MechanicsValidationInput,
	MechanicsValidationResult,
	ResolveMechanicsInput,
	RulesetActionDefinition,
	RulesetAdapter,
} from "./types";

const ACTION_TYPES: readonly RulesetActionDefinition[] = [
	{
		id: "narrative_check",
		label: "Narrative Check",
		description: "A generic fiction-first check with deterministic framing.",
		intents: ["general", "combat"],
		supportLevel: "full",
		targetDifficulty: { required: false, min: 1, max: 40, default: 10 },
		modifier: { default: 0, min: null, max: null },
		contested: {
			enabled: false,
			opponentLabel: null,
			opponentExpression: null,
			tieOutcome: null,
		},
		resolution: {
			mode: "deterministic",
			expression: null,
			successCondition: "total_gte_target",
			deterministicTotal: 10,
			guidance: null,
		},
		outcomeBands: [],
		resourceEffects: [],
		clockEffects: [],
		consequenceChains: [],
	},
	{
		id: "social_check",
		label: "Social Check",
		description: "A fiction-first social push with deterministic framing.",
		intents: ["social"],
		supportLevel: "full",
		targetDifficulty: { required: false, min: 1, max: 40, default: 10 },
		modifier: { default: 0, min: null, max: null },
		contested: {
			enabled: false,
			opponentLabel: null,
			opponentExpression: null,
			tieOutcome: null,
		},
		resolution: {
			mode: "deterministic",
			expression: null,
			successCondition: "total_gte_target",
			deterministicTotal: 10,
			guidance: null,
		},
		outcomeBands: [],
		resourceEffects: [],
		clockEffects: [],
		consequenceChains: [],
	},
	{
		id: "exploration_check",
		label: "Exploration Check",
		description: "A fiction-first discovery or search check.",
		intents: ["explore"],
		supportLevel: "full",
		targetDifficulty: { required: false, min: 1, max: 40, default: 10 },
		modifier: { default: 0, min: null, max: null },
		contested: {
			enabled: false,
			opponentLabel: null,
			opponentExpression: null,
			tieOutcome: null,
		},
		resolution: {
			mode: "deterministic",
			expression: null,
			successCondition: "total_gte_target",
			deterministicTotal: 10,
			guidance: null,
		},
		outcomeBands: [],
		resourceEffects: [],
		clockEffects: [],
		consequenceChains: [],
	},
] as const;

const SUPPORTED_ACTION_TYPES = ACTION_TYPES.map((action) => action.id);

function normalize(input: ResolveMechanicsInput): MechanicsValidationInput {
	return {
		ruleset: "narrative_v1",
		actionType: input.actionType,
		targetDifficulty:
			typeof input.targetDifficulty === "number" ? input.targetDifficulty : 10,
		modifier: typeof input.modifier === "number" ? input.modifier : 0,
		opposedDifficulty: null,
		opposedModifier: 0,
		opposedTotal: null,
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
		availableResources:
			input.availableResources && Object.keys(input.availableResources).length > 0
				? input.availableResources
				: null,
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
		supportLevel: "full",
		actionDefinition:
			ACTION_TYPES.find((action) => action.id === normalized.actionType) ?? null,
	};
}

export const narrativeV1RulesetAdapter: RulesetAdapter = {
	id: "narrative_v1",
	title: "Narrative v1",
	sourceType: "builtin",
	supportedActionTypes: SUPPORTED_ACTION_TYPES,
	capabilities: {
		contested: false,
		conditions: false,
		initiative: false,
		interrupts: false,
		resourceTracking: false,
	},
	actionTypes: ACTION_TYPES,
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
				outcomeBand: null,
				contested: null,
				stateEffects: {
					resources: [],
					clocks: [],
				},
				consequencePlan: {
					matchedChains: [],
					branchTransitions: [],
					steps: [],
					decisionNodes: [],
				},
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
			outcomeBand: null,
			contested: null,
			stateEffects: {
				resources: [],
				clocks: [],
			},
			consequencePlan: {
				matchedChains: [],
				branchTransitions: [],
				steps: [],
				decisionNodes: [],
			},
			resolutionMode: "deterministic",
			supportLevel: "full",
			requiresHumanJudgment: false,
			unsupportedReason: null,
			trace: {
				model: "narrative_v1_deterministic",
				validationWarnings: validation.warnings,
			},
		};
	},
	resolveActionTypeForIntent(intent) {
		return (
			ACTION_TYPES.find((action) => action.intents.includes(intent))?.id ?? null
		);
	},
};
