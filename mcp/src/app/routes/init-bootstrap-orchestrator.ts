import * as z from "zod/v4";
import { recordOrchestratorWorkflowMetric } from "../../telemetry";
import type { AuthContext } from "../../types/contracts";
import {
	buildJsonResponse,
	callMcpJsonRpc,
	closeSession,
	isRecord,
	readToolPayload,
	runOrchestratorStep,
} from "./turns-orchestrator-internal";

const bootstrapAnswersSchema = z
	.object({
		purpose: z.string().trim().min(3).max(3_000).optional(),
		userProfile: z.string().trim().min(3).max(3_000).optional(),
		agentProfile: z.string().trim().min(3).max(3_000).optional(),
		workingPreferences: z.string().trim().min(3).max(3_000).optional(),
		boundaries: z.string().trim().min(3).max(3_000).optional(),
		successCriteria: z.string().trim().min(3).max(3_000).optional(),
		values: z.string().trim().min(3).max(3_000).optional(),
	})
	.partial();

const setupAnswersSchema = z
	.object({
		ttrpgSystem: z.string().trim().min(2).max(160).optional(),
		systemUrl: z.string().trim().max(2_000).optional(),
		sourceMaterialsStatus: z.enum(["complete", "partial", "none"]).optional(),
		diceRoller: z.enum(["player", "bardo"]).optional(),
		playerCount: z.number().int().min(1).max(20).optional(),
		sourcePolicy: z
			.enum(["use_provided_only", "allow_conservative_skeleton"])
			.optional(),
		additionalContext: z.string().trim().max(4_000).optional(),
		materialsConfirmation: z.string().trim().max(4_000).optional(),
	})
	.partial();

const initBootstrapPayloadSchema = z.object({
	answers: bootstrapAnswersSchema.optional(),
	setupAnswers: setupAnswersSchema.optional(),
	setupRevision: z.number().int().nonnegative().optional(),
	workspaceId: z.string().trim().min(1).max(120).optional(),
});

type InitBootstrapPayload = z.infer<typeof initBootstrapPayloadSchema>;

export function parseInitBootstrapPayload(
	input: unknown,
): InitBootstrapPayload {
	const parsed = initBootstrapPayloadSchema.safeParse(input);
	if (!parsed.success) {
		const firstIssue = parsed.error.issues[0];
		const issueText =
			firstIssue?.message ?? "Payload must include valid bootstrap answers.";
		throw new Error(`Invalid init bootstrap payload: ${issueText}`);
	}
	return parsed.data;
}

function asOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function asOptionalNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function handleInitBootstrapRequest(
	request: Request,
	auth: AuthContext,
	telemetryEnabled = true,
): Promise<Response> {
	let payload: InitBootstrapPayload;
	try {
		const raw = await request.json();
		payload = parseInitBootstrapPayload(raw);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Invalid request body. Expected JSON payload.";
		return buildJsonResponse(400, {
			success: false,
			error: message,
		});
	}

	const workflowId = crypto.randomUUID();
	const workflow = "init_bootstrap";
	let sessionId: string | null = null;

	try {
		const initialize = await runOrchestratorStep({
			workflow,
			step: "initialize",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					body: {
						jsonrpc: "2.0",
						id: 1,
						method: "initialize",
						params: {
							protocolVersion: "2025-03-26",
							capabilities: {},
							clientInfo: {
								name: "bardo-init-orchestrator",
								version: "1.0.0",
							},
						},
					},
				}),
		});

		sessionId = initialize.sessionId;
		if (!sessionId) {
			throw new Error(
				"MCP session initialization failed (missing session id).",
			);
		}
		const activeSessionId = sessionId;

		await runOrchestratorStep({
			workflow,
			step: "initialized_notification",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						method: "notifications/initialized",
					},
				}),
		});

		const initCall = await runOrchestratorStep({
			workflow,
			step: "init_tool",
			telemetryEnabled,
			fn: () =>
				callMcpJsonRpc({
					request,
					auth,
					sessionId: activeSessionId,
					body: {
						jsonrpc: "2.0",
						id: 2,
						method: "tools/call",
						params: {
							name: "init",
							arguments: {
								bootstrapAnswers:
									payload.answers && Object.keys(payload.answers).length > 0
										? payload.answers
										: undefined,
								setupAnswers:
									payload.setupAnswers &&
									Object.keys(payload.setupAnswers).length > 0
										? payload.setupAnswers
										: undefined,
								setupRevision: payload.setupRevision,
							},
						},
					},
				}),
		});

		const initResult =
			isRecord(initCall.lastEvent) && isRecord(initCall.lastEvent.result)
				? readToolPayload(initCall.lastEvent.result)
				: null;

		if (!isRecord(initResult)) {
			throw new Error("Init bootstrap returned an invalid payload.");
		}

		const bootstrap = isRecord(initResult.bootstrap)
			? initResult.bootstrap
			: {};
		const pendingQuestionKey = asOptionalString(bootstrap.pendingQuestionKey);
		const bootstrapPrompt = asOptionalString(bootstrap.nextPrompt);
		const nextPrompts = Array.isArray(initResult.nextPrompts)
			? initResult.nextPrompts
			: [];
		const campaignPrompt = asOptionalString(nextPrompts[0]);
		const bootstrapComplete = bootstrap.complete === true;
		const campaignNeedsInput = initResult.requiresUserInput === true;
		const needsInput = !bootstrapComplete || campaignNeedsInput;
		const status = needsInput ? "needs_input" : "complete";
		const setupQuestionKey = asOptionalString(initResult.setupQuestionKey);
		const setupQuestion = asOptionalString(initResult.setupQuestion);
		const setupRevision = asOptionalNumber(initResult.setupRevision);
		const questionKey = !bootstrapComplete
			? pendingQuestionKey
			: campaignNeedsInput
				? (setupQuestionKey ?? "campaign_setup")
				: null;
		const question = !bootstrapComplete
			? bootstrapPrompt
			: (setupQuestion ?? campaignPrompt);
		const answeredCount = asOptionalNumber(bootstrap.answeredCount) ?? 0;
		const totalQuestions = asOptionalNumber(bootstrap.totalQuestions) ?? 0;

		if (telemetryEnabled) {
			recordOrchestratorWorkflowMetric({ workflow, status: "success" });
		}
		return buildJsonResponse(
			200,
			{
				success: true,
				workflowId,
				mode: "orchestrated-init-bootstrap",
				status,
				questionKey,
				question,
				progress: {
					answered: answeredCount,
					total: totalQuestions,
				},
				bootstrap: {
					complete: bootstrapComplete,
					alreadyInitialized: bootstrap.alreadyInitialized === true,
					pendingQuestionKey,
					nextPrompt: bootstrapPrompt,
					bootstrapPath: asOptionalString(bootstrap.bootstrapPath),
					identityPath: asOptionalString(bootstrap.identityPath),
					userPath: asOptionalString(bootstrap.userPath),
					soulPath: asOptionalString(bootstrap.soulPath),
					includeValues: bootstrap.includeValues === true,
					answeredCount,
					totalQuestions,
				},
				campaignSetup: {
					setupComplete: initResult.setupComplete === true,
					requiresUserInput: campaignNeedsInput,
					nextPrompt: campaignPrompt,
				},
				setup: {
					status: asOptionalString(initResult.setupStatus),
					questionKey: setupQuestionKey,
					question: setupQuestion,
					revision: setupRevision,
				},
			},
			{
				"x-workflow-id": workflowId,
			},
		);
	} catch (error) {
		if (telemetryEnabled) {
			recordOrchestratorWorkflowMetric({ workflow, status: "error" });
		}
		const message =
			error instanceof Error
				? error.message
				: "Failed to resolve init bootstrap workflow.";
		return buildJsonResponse(502, {
			success: false,
			workflowId,
			error: message,
		});
	} finally {
		if (sessionId) {
			try {
				await closeSession(request, auth, sessionId);
			} catch {
				// Ignore close errors. Session TTL cleanup still applies.
			}
		}
	}
}
