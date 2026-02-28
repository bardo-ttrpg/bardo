import { rm, writeFile } from "node:fs/promises";
import { parseJsonObject } from "../../../domain/campaign/json";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
} from "../../../infra/filesystem/filesystem";
import type { InitPaths } from "./paths";

const BOOTSTRAP_VERSION = 1;

export const bootstrapQuestionOrder = [
	"purpose",
	"userProfile",
	"agentProfile",
	"workingPreferences",
	"boundaries",
	"successCriteria",
	"values",
] as const;

export type BootstrapAnswerKey = (typeof bootstrapQuestionOrder)[number];
type BootstrapAnswers = Partial<Record<BootstrapAnswerKey, string>>;

type BootstrapState = {
	version: number;
	initialized: boolean;
	initializedAtISO: string | null;
	answers: BootstrapAnswers;
	includeValues: boolean;
};

const bootstrapPrompts: Record<BootstrapAnswerKey, string> = {
	purpose: "What are we building together?",
	userProfile:
		"What should I know about your profile, constraints, and context to support you well?",
	agentProfile:
		"How should I behave as your agent (tone, initiative, and level of challenge)?",
	workingPreferences:
		"What collaboration preferences should I follow (communication style, verbosity, cadence)?",
	boundaries:
		"What boundaries or red flags should I strictly avoid while working with you?",
	successCriteria:
		"How will we define success and which checkpoints should we track?",
	values:
		"What values should guide this collaboration? (Used only when SOUL.md is present.)",
};

type BootstrapFileWriteInput = {
	answers: BootstrapAnswers;
	nowIso: string;
	complete: boolean;
};

type RunBootstrapStepInput = {
	paths: InitPaths;
	nowIso: string;
	bootstrapAnswers?: BootstrapAnswers;
};

type BootstrapStepResult = {
	complete: boolean;
	alreadyInitialized: boolean;
	requiresUserInput: boolean;
	nextPrompt: string | null;
	pendingQuestionKey: BootstrapAnswerKey | null;
	answers: BootstrapAnswers;
	bootstrapPath: string;
	identityPath: string;
	userPath: string;
	soulPath: string;
	includeValues: boolean;
	answeredCount: number;
	totalQuestions: number;
	ignoredAnswerKeys: BootstrapAnswerKey[];
};

function toCleanText(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAnswers(
	input: BootstrapAnswers | undefined,
): BootstrapAnswers {
	if (!input) {
		return {};
	}
	const out: BootstrapAnswers = {};
	for (const key of bootstrapQuestionOrder) {
		const cleaned = toCleanText(input[key]);
		if (cleaned) {
			out[key] = cleaned;
		}
	}
	return out;
}

function mergeAnswers(
	base: BootstrapAnswers,
	override: BootstrapAnswers,
): BootstrapAnswers {
	const merged: BootstrapAnswers = { ...base };
	for (const key of bootstrapQuestionOrder) {
		const incoming = override[key];
		if (incoming) {
			merged[key] = incoming;
		}
	}
	return merged;
}

function filterIncomingAnswersForPendingQuestion(args: {
	existingAnswers: BootstrapAnswers;
	incomingAnswers: BootstrapAnswers;
	requiredQuestions: BootstrapAnswerKey[];
}): { accepted: BootstrapAnswers; ignoredKeys: BootstrapAnswerKey[] } {
	const pendingQuestionKey = getFirstMissingAnswer(
		args.existingAnswers,
		args.requiredQuestions,
	);
	if (!pendingQuestionKey) {
		return { accepted: {}, ignoredKeys: [] };
	}
	const pendingValue = args.incomingAnswers[pendingQuestionKey];
	const ignoredKeys = Object.keys(args.incomingAnswers).filter(
		(key): key is BootstrapAnswerKey =>
			key !== pendingQuestionKey &&
			bootstrapQuestionOrder.includes(key as BootstrapAnswerKey),
	);
	return {
		accepted: pendingValue ? { [pendingQuestionKey]: pendingValue } : {},
		ignoredKeys,
	};
}

async function writeIfMissing(
	filePath: string,
	content: string,
): Promise<void> {
	const existing = await readTextIfExists(filePath);
	if (existing !== null) {
		return;
	}
	await ensureParentDirectoryExists(filePath);
	await writeFile(filePath, content, "utf8");
}

function renderAgentsBootstrapContract(): string {
	return `# Bootstrap Contract

This workspace uses a one-time \`/init\` bootstrap ritual.

- \`IDENTITY.md\` defines agent commitments and behavior.
- \`USER.md\` defines user context and collaboration preferences.
- \`SOUL.md\` values are enforced only when that file exists.

If \`BOOTSTRAP.md\` exists, continue asking one bootstrap question at a time until complete.
`;
}

function renderIdentityContent(input: BootstrapFileWriteInput): string {
	return renderMarkdown(
		{
			description: "Agent identity commitments and operating behavior",
			title: "Identity",
			bootstrapStatus: input.complete ? "complete" : "in_progress",
			updatedAtISO: input.nowIso,
		},
		[
			"# Core Purpose",
			"",
			input.answers.purpose ?? "Pending bootstrap answer.",
			"",
			"# Agent Profile",
			"",
			input.answers.agentProfile ?? "Pending bootstrap answer.",
			"",
			"# Working Preferences",
			"",
			input.answers.workingPreferences ?? "Pending bootstrap answer.",
			"",
			"# Boundaries",
			"",
			input.answers.boundaries ?? "Pending bootstrap answer.",
			"",
			"# Success Criteria",
			"",
			input.answers.successCriteria ?? "Pending bootstrap answer.",
			"",
		].join("\n"),
	);
}

function renderUserContent(input: BootstrapFileWriteInput): string {
	return renderMarkdown(
		{
			description: "User profile, constraints, and context",
			title: "User Profile",
			bootstrapStatus: input.complete ? "complete" : "in_progress",
			updatedAtISO: input.nowIso,
		},
		[
			"# User Context",
			"",
			input.answers.userProfile ?? "Pending bootstrap answer.",
			"",
			"# Collaboration Goal",
			"",
			input.answers.purpose ?? "Pending bootstrap answer.",
			"",
		].join("\n"),
	);
}

function renderSoulContent(input: BootstrapFileWriteInput): string {
	return renderMarkdown(
		{
			description: "Shared values and non-negotiable principles",
			title: "Soul",
			bootstrapStatus: input.complete ? "complete" : "in_progress",
			updatedAtISO: input.nowIso,
		},
		[
			"# Guiding Values",
			"",
			input.answers.values ?? "Pending bootstrap answer.",
			"",
		].join("\n"),
	);
}

function normalizeBootstrapState(raw: unknown): BootstrapState | null {
	if (typeof raw !== "object" || raw === null) {
		return null;
	}

	const record = raw as Record<string, unknown>;
	const answersRaw =
		typeof record.answers === "object" && record.answers !== null
			? (record.answers as Record<string, unknown>)
			: {};
	const answers: BootstrapAnswers = {};
	for (const key of bootstrapQuestionOrder) {
		const cleaned = toCleanText(answersRaw[key]);
		if (cleaned) {
			answers[key] = cleaned;
		}
	}

	return {
		version:
			typeof record.version === "number" ? record.version : BOOTSTRAP_VERSION,
		initialized: record.initialized === true,
		initializedAtISO:
			typeof record.initializedAtISO === "string"
				? record.initializedAtISO
				: null,
		answers,
		includeValues: record.includeValues === true,
	};
}

async function readBootstrapState(
	bootstrapPath: string,
): Promise<BootstrapState | null> {
	const raw = await readTextIfExists(bootstrapPath);
	if (raw === null) {
		return null;
	}
	const parsed = parseMarkdown(raw);
	const state = parseJsonObject(parsed.content.trim());
	return normalizeBootstrapState(state);
}

async function writeBootstrapState(
	bootstrapPath: string,
	state: BootstrapState,
): Promise<void> {
	await ensureParentDirectoryExists(bootstrapPath);
	await writeFile(
		bootstrapPath,
		renderMarkdown(
			{
				description:
					"In-progress /init bootstrap data. Remove only after complete.",
				title: "Bootstrap Progress",
			},
			JSON.stringify(state, null, 2),
		),
		"utf8",
	);
}

async function detectAlreadyInitialized(paths: InitPaths): Promise<boolean> {
	const identityRaw = await readTextIfExists(paths.identityPath);
	const userRaw = await readTextIfExists(paths.userPath);
	if (!identityRaw || !userRaw) {
		return false;
	}

	const identity = parseMarkdown(identityRaw);
	const user = parseMarkdown(userRaw);
	return (
		identity.frontmatter.bootstrapStatus === "complete" &&
		user.frontmatter.bootstrapStatus === "complete"
	);
}

function getRequiredQuestions(includeValues: boolean): BootstrapAnswerKey[] {
	if (includeValues) {
		return [...bootstrapQuestionOrder];
	}
	return bootstrapQuestionOrder.filter((key) => key !== "values");
}

function getFirstMissingAnswer(
	answers: BootstrapAnswers,
	required: BootstrapAnswerKey[],
): BootstrapAnswerKey | null {
	for (const key of required) {
		if (!answers[key]) {
			return key;
		}
	}
	return null;
}

async function writeBootstrapDocs(args: {
	paths: InitPaths;
	answers: BootstrapAnswers;
	nowIso: string;
	complete: boolean;
	includeValues: boolean;
}): Promise<void> {
	await ensureParentDirectoryExists(args.paths.identityPath);
	await writeFile(
		args.paths.identityPath,
		renderIdentityContent({
			answers: args.answers,
			nowIso: args.nowIso,
			complete: args.complete,
		}),
		"utf8",
	);

	await ensureParentDirectoryExists(args.paths.userPath);
	await writeFile(
		args.paths.userPath,
		renderUserContent({
			answers: args.answers,
			nowIso: args.nowIso,
			complete: args.complete,
		}),
		"utf8",
	);

	if (args.includeValues) {
		await ensureParentDirectoryExists(args.paths.soulPath);
		await writeFile(
			args.paths.soulPath,
			renderSoulContent({
				answers: args.answers,
				nowIso: args.nowIso,
				complete: args.complete,
			}),
			"utf8",
		);
	}
}

export async function runBootstrapStep(
	input: RunBootstrapStepInput,
): Promise<BootstrapStepResult> {
	const incomingAnswers = normalizeAnswers(input.bootstrapAnswers);

	await writeIfMissing(input.paths.agentsPath, renderAgentsBootstrapContract());
	await writeIfMissing(
		input.paths.identityPath,
		renderIdentityContent({
			answers: {},
			nowIso: input.nowIso,
			complete: false,
		}),
	);
	await writeIfMissing(
		input.paths.userPath,
		renderUserContent({
			answers: {},
			nowIso: input.nowIso,
			complete: false,
		}),
	);

	const bootstrapState = await readBootstrapState(input.paths.bootstrapPath);
	const alreadyInitialized =
		bootstrapState?.initialized === true ||
		(await detectAlreadyInitialized(input.paths));

	if (alreadyInitialized && Object.keys(incomingAnswers).length === 0) {
		const includeValues = bootstrapState?.includeValues === true;
		const totalQuestions = getRequiredQuestions(includeValues).length;
		const answeredCount = totalQuestions;
		return {
			complete: true,
			alreadyInitialized: true,
			requiresUserInput: false,
			nextPrompt: null,
			pendingQuestionKey: null,
			answers: bootstrapState?.answers ?? {},
			bootstrapPath: input.paths.bootstrapPath,
			identityPath: input.paths.identityPath,
			userPath: input.paths.userPath,
			soulPath: input.paths.soulPath,
			includeValues,
			answeredCount,
			totalQuestions,
			ignoredAnswerKeys: [],
		};
	}

	const soulRaw = await readTextIfExists(input.paths.soulPath);
	const includeValues =
		Boolean(soulRaw) ||
		bootstrapState?.includeValues === true ||
		Boolean(incomingAnswers.values);
	const requiredQuestions = getRequiredQuestions(includeValues);

	const existingAnswers = bootstrapState?.answers ?? {};
	const filteredIncomingAnswers = filterIncomingAnswersForPendingQuestion({
		existingAnswers,
		incomingAnswers,
		requiredQuestions,
	});
	const answers = mergeAnswers(
		existingAnswers,
		filteredIncomingAnswers.accepted,
	);
	const totalQuestions = requiredQuestions.length;
	const answeredCount = requiredQuestions.filter((key) =>
		Boolean(answers[key]),
	).length;
	const pendingQuestionKey = getFirstMissingAnswer(answers, requiredQuestions);

	if (pendingQuestionKey) {
		await writeBootstrapDocs({
			paths: input.paths,
			answers,
			nowIso: input.nowIso,
			complete: false,
			includeValues,
		});

		await writeBootstrapState(input.paths.bootstrapPath, {
			version: BOOTSTRAP_VERSION,
			initialized: false,
			initializedAtISO: null,
			answers,
			includeValues,
		});

		return {
			complete: false,
			alreadyInitialized: false,
			requiresUserInput: true,
			nextPrompt: bootstrapPrompts[pendingQuestionKey],
			pendingQuestionKey,
			answers,
			bootstrapPath: input.paths.bootstrapPath,
			identityPath: input.paths.identityPath,
			userPath: input.paths.userPath,
			soulPath: input.paths.soulPath,
			includeValues,
			answeredCount,
			totalQuestions,
			ignoredAnswerKeys: filteredIncomingAnswers.ignoredKeys,
		};
	}

	await writeBootstrapDocs({
		paths: input.paths,
		answers,
		nowIso: input.nowIso,
		complete: true,
		includeValues,
	});
	await rm(input.paths.bootstrapPath, { force: true });

	return {
		complete: true,
		alreadyInitialized,
		requiresUserInput: false,
		nextPrompt: null,
		pendingQuestionKey: null,
		answers,
		bootstrapPath: input.paths.bootstrapPath,
		identityPath: input.paths.identityPath,
		userPath: input.paths.userPath,
		soulPath: input.paths.soulPath,
		includeValues,
		answeredCount: totalQuestions,
		totalQuestions,
		ignoredAnswerKeys: filteredIncomingAnswers.ignoredKeys,
	};
}
