type BootstrapAnswers = Partial<
	Record<
		| "purpose"
		| "userProfile"
		| "agentProfile"
		| "workingPreferences"
		| "boundaries"
		| "successCriteria"
		| "values",
		string
	>
>;

type SetupAnswers = Partial<
	Record<
		| "ttrpgSystem"
		| "systemUrl"
		| "sourceMaterialsStatus"
		| "diceRoller"
		| "playerCount"
		| "sourcePolicy"
		| "additionalContext"
		| "materialsConfirmation",
		string | number
	>
>;

export type InitBootstrapResponse = {
	success: boolean;
	status: "needs_input" | "complete" | "error";
	questionKey: string | null;
	question: string | null;
	progress: {
		answered: number;
		total: number;
	};
	bootstrap: {
		complete: boolean;
		alreadyInitialized: boolean;
		pendingQuestionKey: string | null;
		nextPrompt: string | null;
		includeValues: boolean;
		answeredCount: number;
		totalQuestions: number;
	};
	campaignSetup: {
		setupComplete: boolean;
		requiresUserInput: boolean;
		nextPrompt: string | null;
	};
	setup?: {
		status: string | null;
		questionKey: string | null;
		question: string | null;
		revision: number | null;
	};
	error?: string;
};

function resolveMcpBaseUrl(): string {
	return (
		process.env.BARDO_MCP_BASE_URL?.trim() ||
		process.env.NEXT_PUBLIC_MCP_BASE_URL?.trim() ||
		"http://127.0.0.1:3000"
	);
}

function mcpHeaders(): HeadersInit {
	const headers: HeadersInit = {
		"content-type": "application/json",
	};
	const apiKey = process.env.BARDO_MCP_API_KEY?.trim();
	if (apiKey) {
		headers["x-api-key"] = apiKey;
	}
	return headers;
}

export async function requestInitBootstrap(args?: {
	answers?: BootstrapAnswers;
	setupAnswers?: SetupAnswers;
	setupRevision?: number;
	workspaceId?: string;
}): Promise<InitBootstrapResponse> {
	const url = new URL("/api/v1/init/bootstrap", resolveMcpBaseUrl());
	const response = await fetch(url, {
		method: "POST",
		headers: mcpHeaders(),
		body: JSON.stringify({
			answers: args?.answers,
			setupAnswers: args?.setupAnswers,
			setupRevision: args?.setupRevision,
			workspaceId: args?.workspaceId,
		}),
		cache: "no-store",
	});

	let payload: Record<string, unknown> = {};
	try {
		payload = (await response.json()) as Record<string, unknown>;
	} catch {
		payload = {};
	}

	if (!response.ok) {
		return {
			success: false,
			status: "error",
			questionKey: null,
			question: null,
			progress: { answered: 0, total: 0 },
			bootstrap: {
				complete: false,
				alreadyInitialized: false,
				pendingQuestionKey: null,
				nextPrompt: null,
				includeValues: false,
				answeredCount: 0,
				totalQuestions: 0,
			},
			campaignSetup: {
				setupComplete: false,
				requiresUserInput: false,
				nextPrompt: null,
			},
			error:
				typeof payload.error === "string"
					? payload.error
					: "Init bootstrap request failed.",
		};
	}

	const statusValue =
		payload.status === "complete" || payload.status === "needs_input"
			? payload.status
			: "error";
	const progressRecord =
		typeof payload.progress === "object" && payload.progress !== null
			? (payload.progress as Record<string, unknown>)
			: {};
	const bootstrapRecord =
		typeof payload.bootstrap === "object" && payload.bootstrap !== null
			? (payload.bootstrap as Record<string, unknown>)
			: {};
	const campaignSetupRecord =
		typeof payload.campaignSetup === "object" && payload.campaignSetup !== null
			? (payload.campaignSetup as Record<string, unknown>)
			: {};
	const setupRecord =
		typeof payload.setup === "object" && payload.setup !== null
			? (payload.setup as Record<string, unknown>)
			: {};

	return {
		success: payload.success === true,
		status: statusValue,
		questionKey:
			typeof payload.questionKey === "string" ? payload.questionKey : null,
		question: typeof payload.question === "string" ? payload.question : null,
		progress: {
			answered:
				typeof progressRecord.answered === "number"
					? progressRecord.answered
					: 0,
			total:
				typeof progressRecord.total === "number" ? progressRecord.total : 0,
		},
		bootstrap: {
			complete: bootstrapRecord.complete === true,
			alreadyInitialized: bootstrapRecord.alreadyInitialized === true,
			pendingQuestionKey:
				typeof bootstrapRecord.pendingQuestionKey === "string"
					? bootstrapRecord.pendingQuestionKey
					: null,
			nextPrompt:
				typeof bootstrapRecord.nextPrompt === "string"
					? bootstrapRecord.nextPrompt
					: null,
			includeValues: bootstrapRecord.includeValues === true,
			answeredCount:
				typeof bootstrapRecord.answeredCount === "number"
					? bootstrapRecord.answeredCount
					: 0,
			totalQuestions:
				typeof bootstrapRecord.totalQuestions === "number"
					? bootstrapRecord.totalQuestions
					: 0,
		},
		campaignSetup: {
			setupComplete: campaignSetupRecord.setupComplete === true,
			requiresUserInput: campaignSetupRecord.requiresUserInput === true,
			nextPrompt:
				typeof campaignSetupRecord.nextPrompt === "string"
					? campaignSetupRecord.nextPrompt
					: null,
		},
		setup: {
			status:
				typeof setupRecord.status === "string" ? setupRecord.status : null,
			questionKey:
				typeof setupRecord.questionKey === "string"
					? setupRecord.questionKey
					: null,
			question:
				typeof setupRecord.question === "string" ? setupRecord.question : null,
			revision:
				typeof setupRecord.revision === "number" ? setupRecord.revision : null,
		},
		error: typeof payload.error === "string" ? payload.error : undefined,
	};
}
