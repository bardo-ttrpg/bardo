export type SetupPromptInputType = "single_choice_or_text" | "free_text";

export type SetupPromptChoice = {
	id: string;
	label: string;
	description?: string;
	recommended?: boolean;
};

export type SetupPromptValidation = {
	minLength?: number;
	maxLength?: number;
	allowedChoiceIds?: string[];
};

export type SetupPromptQuestionKey =
	| "purpose"
	| "userProfile"
	| "agentProfile"
	| "workingPreferences"
	| "boundaries"
	| "successCriteria"
	| "values"
	| "ttrpgSystem"
	| "diceRoller"
	| "theme"
	| "campaignPremise"
	| "openingSituation"
	| "partyRoster"
	| "sourceAdaptationNotes";

export type SetupPrompt = {
	version: "2.0";
	questionKey: SetupPromptQuestionKey;
	prompt: string;
	inputType: SetupPromptInputType;
	choices: SetupPromptChoice[];
	allowCustomText: boolean;
	validation: SetupPromptValidation;
};

function freeTextPrompt(
	questionKey: SetupPromptQuestionKey,
	prompt: string,
): SetupPrompt {
	return {
		version: "2.0",
		questionKey,
		prompt,
		inputType: "free_text",
		choices: [],
		allowCustomText: true,
		validation: {
			minLength: 3,
			maxLength: 3_000,
		},
	};
}

export function buildSetupPrompt(args: {
	questionKey: string | null;
	prompt: string | null;
}): SetupPrompt | null {
	if (!args.questionKey || !args.prompt) {
		return null;
	}

	switch (args.questionKey) {
		case "purpose":
		case "userProfile":
		case "agentProfile":
		case "workingPreferences":
		case "boundaries":
		case "successCriteria":
		case "values":
			return freeTextPrompt(args.questionKey, args.prompt);
		case "ttrpgSystem": {
			const choices: SetupPromptChoice[] = [
				{ id: "d20", label: "D20", recommended: true },
				{ id: "narrative", label: "Narrative" },
				{ id: "dice_pool", label: "Dice pool" },
				{ id: "custom", label: "Custom" },
			];
			return {
				version: "2.0",
				questionKey: "ttrpgSystem",
				prompt: args.prompt,
				inputType: "single_choice_or_text",
				choices,
				allowCustomText: true,
				validation: {
					minLength: 2,
					maxLength: 160,
					allowedChoiceIds: choices.map((choice) => choice.id),
				},
			};
		}
		case "diceRoller": {
			const choices: SetupPromptChoice[] = [
				{
					id: "player",
					label: "Every player rolls his own character dice",
					description: "You'll roll your own character dice.",
					recommended: true,
				},
				{
					id: "bardo",
					label: "Bardo rolls all dice",
					description:
						"I'll roll dice for you when needed, even your character rolls.",
				},
			];
			return {
				version: "2.0",
				questionKey: "diceRoller",
				prompt: args.prompt,
				inputType: "single_choice_or_text",
				choices,
				allowCustomText: true,
				validation: {
					allowedChoiceIds: choices.map((choice) => choice.id),
				},
			};
		}
		case "theme": {
			const choices: SetupPromptChoice[] = [
				{ id: "fantasy", label: "Fantasy", recommended: true },
				{ id: "sci_fi", label: "Sci-Fi" },
				{ id: "horror", label: "Horror" },
				{ id: "post_apocalyptic", label: "Post-Apocalyptic" },
				{ id: "mystery_investigation", label: "Mystery & Investigation" },
			];
			return {
				version: "2.0",
				questionKey: "theme",
				prompt: args.prompt,
				inputType: "single_choice_or_text",
				choices,
				allowCustomText: true,
				validation: {
					minLength: 2,
					maxLength: 120,
					allowedChoiceIds: choices.map((choice) => choice.id),
				},
			};
		}
		case "campaignPremise":
		case "openingSituation":
		case "partyRoster":
		case "sourceAdaptationNotes":
			return freeTextPrompt(args.questionKey, args.prompt);
		default:
			return null;
	}
}
