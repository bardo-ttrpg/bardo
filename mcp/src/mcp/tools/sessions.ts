import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import type {
	SessionRegistry,
	SessionStatus,
} from "../../session/session-registry";
import type { AuthContext } from "../../types/contracts";
import { makeToolResult } from "../tool-result";

const sessionKindSchema = z.enum(["main", "agent"]);
const sessionStatusSchema = z.enum(["active", "idle", "queued", "closed"]);

const sessionsListInputSchema = z.object({
	kinds: z.array(sessionKindSchema).max(4).optional(),
	limit: z.number().int().min(1).max(100).optional(),
	activeMinutes: z
		.number()
		.int()
		.min(1)
		.max(7 * 24 * 60)
		.optional(),
	messageLimit: z.number().int().min(1).max(100).optional(),
});

const sessionsHistoryInputSchema = z.object({
	sessionKey: z.string().trim().min(1).max(200).optional(),
	limit: z.number().int().min(1).max(500).optional(),
	includeTools: z.boolean().optional(),
});

const sessionsSendInputSchema = z.object({
	sessionKey: z.string().trim().min(1).max(200),
	message: z.string().trim().min(1).max(8_000),
	timeoutSeconds: z.number().int().min(0).max(600).optional(),
});

const sessionsSpawnInputSchema = z.object({
	task: z.string().trim().min(1).max(8_000),
	label: z.string().trim().min(1).max(80).optional(),
	agentId: z.string().trim().min(1).max(120).optional(),
	model: z.string().trim().min(1).max(200).optional(),
	runTimeoutSeconds: z.number().int().min(1).max(3600).optional(),
	cleanup: z.boolean().optional(),
});

const sessionStatusInputSchema = z.object({
	sessionKey: z.string().trim().min(1).max(200).optional(),
	status: sessionStatusSchema.optional(),
	model: z.string().trim().min(1).max(200).optional(),
});

const sessionListItemSchema = z.object({
	sessionId: z.string(),
	sessionKey: z.string(),
	kind: sessionKindSchema,
	status: sessionStatusSchema,
	createdAt: z.number().int(),
	updatedAt: z.number().int(),
	modelOverride: z.string().nullable(),
	pendingMessages: z.number().int().nonnegative(),
});

const sessionsListOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	currentSessionId: z.string().nullable(),
	sessions: z.array(sessionListItemSchema),
});

const sessionsHistoryOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	sessionId: z.string().nullable(),
	sessionKey: z.string().nullable(),
	history: z.array(
		z.object({
			at: z.number().int(),
			type: z.string(),
			summary: z.string(),
			data: z.record(z.string(), z.unknown()).optional(),
		}),
	),
});

const sessionsSendOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	fromSessionId: z.string().nullable(),
	targetSessionId: z.string().nullable(),
	messageId: z.string().nullable(),
	delivered: z.boolean(),
	timeoutSeconds: z.number().int().nonnegative(),
});

const sessionsSpawnOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	parentSessionId: z.string().nullable(),
	spawned: sessionListItemSchema.nullable(),
	agentId: z.string().nullable(),
	model: z.string().nullable(),
	runTimeoutSeconds: z.number().int().nullable(),
	cleanup: z.boolean(),
});

const sessionStatusOutputSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	sessionId: z.string().nullable(),
	sessionKey: z.string().nullable(),
	status: sessionStatusSchema.nullable(),
	modelOverride: z.string().nullable(),
});

function getCurrentSessionId(
	getCurrentSessionId: () => string | null,
): string | null {
	const sessionId = getCurrentSessionId();
	return sessionId && sessionId.trim().length > 0 ? sessionId : null;
}

function chooseSessionKey(args: {
	explicitSessionKey: string | undefined;
	currentSessionId: string | null;
}): string | null {
	if (args.explicitSessionKey && args.explicitSessionKey.trim().length > 0) {
		return args.explicitSessionKey.trim();
	}
	return args.currentSessionId;
}

function castSessionStatus(
	input: SessionStatus,
): "active" | "idle" | "queued" | "closed" {
	return input;
}

export function registerSessionManagementTools(
	server: McpServer,
	_auth: AuthContext,
	deps: {
		sessionRegistry: SessionRegistry;
		getCurrentSessionId: () => string | null;
	},
): void {
	server.registerTool(
		"sessions_list",
		{
			title: "Sessions List",
			description:
				"List active and recent sessions for multi-agent orchestration and routing.",
			inputSchema: sessionsListInputSchema,
			outputSchema: sessionsListOutputSchema,
			annotations: {
				title: "Sessions List",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ kinds, limit, activeMinutes }) => {
			const currentSessionId = getCurrentSessionId(deps.getCurrentSessionId);
			const sessions = deps.sessionRegistry.listSessions({
				kinds,
				limit,
				activeMinutes,
			});
			return makeToolResult({
				success: true,
				message:
					sessions.length > 0
						? "Sessions listed successfully."
						: "No sessions found for the requested filters.",
				currentSessionId,
				sessions,
			});
		},
	);

	server.registerTool(
		"sessions_history",
		{
			title: "Sessions History",
			description:
				"Get serialized session event history (JSON-RPC, tool events, messages, status changes).",
			inputSchema: sessionsHistoryInputSchema,
			outputSchema: sessionsHistoryOutputSchema,
			annotations: {
				title: "Sessions History",
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ sessionKey, limit, includeTools }) => {
			const currentSessionId = getCurrentSessionId(deps.getCurrentSessionId);
			const target = chooseSessionKey({
				explicitSessionKey: sessionKey,
				currentSessionId,
			});
			if (!target) {
				return makeToolResult(
					{
						success: false,
						message: "No session is available for history lookup.",
						sessionId: null,
						sessionKey: null,
						history: [],
					},
					true,
				);
			}

			const resolvedSessionId = deps.sessionRegistry.resolveSessionId(target);
			const history = deps.sessionRegistry.getHistory({
				sessionKeyOrId: target,
				limit,
				includeTools,
			});

			return makeToolResult({
				success: true,
				message:
					history.length > 0
						? "Session history retrieved successfully."
						: "Session history is empty.",
				sessionId: resolvedSessionId,
				sessionKey: target,
				history,
			});
		},
	);

	server.registerTool(
		"sessions_send",
		{
			title: "Sessions Send",
			description:
				"Send a coordination message from the current session to another session.",
			inputSchema: sessionsSendInputSchema,
			outputSchema: sessionsSendOutputSchema,
			annotations: {
				title: "Sessions Send",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ sessionKey, message, timeoutSeconds }) => {
			const fromSessionId = getCurrentSessionId(deps.getCurrentSessionId);
			if (!fromSessionId) {
				return makeToolResult(
					{
						success: false,
						message: "Current session is not available.",
						fromSessionId: null,
						targetSessionId: null,
						messageId: null,
						delivered: false,
						timeoutSeconds: timeoutSeconds ?? 0,
					},
					true,
				);
			}

			const send = deps.sessionRegistry.sendMessage({
				fromSessionId,
				targetSessionKeyOrId: sessionKey,
				message,
			});
			if (!send.accepted) {
				return makeToolResult(
					{
						success: false,
						message: "Target session not found.",
						fromSessionId,
						targetSessionId: null,
						messageId: null,
						delivered: false,
						timeoutSeconds: timeoutSeconds ?? 0,
					},
					true,
				);
			}

			return makeToolResult({
				success: true,
				message: "Message queued for target session.",
				fromSessionId,
				targetSessionId: send.targetSessionId,
				messageId: send.messageId,
				delivered: send.delivered,
				timeoutSeconds: timeoutSeconds ?? 0,
			});
		},
	);

	server.registerTool(
		"sessions_spawn",
		{
			title: "Sessions Spawn",
			description:
				"Create a child agent session record and queue its initial task for orchestration.",
			inputSchema: sessionsSpawnInputSchema,
			outputSchema: sessionsSpawnOutputSchema,
			annotations: {
				title: "Sessions Spawn",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async ({ task, label, agentId, model, runTimeoutSeconds, cleanup }) => {
			const parentSessionId = getCurrentSessionId(deps.getCurrentSessionId);
			if (!parentSessionId) {
				return makeToolResult(
					{
						success: false,
						message: "Current session is not available.",
						parentSessionId: null,
						spawned: null,
						agentId: agentId ?? null,
						model: model ?? null,
						runTimeoutSeconds: runTimeoutSeconds ?? null,
						cleanup: cleanup ?? true,
					},
					true,
				);
			}

			const spawned = deps.sessionRegistry.spawnSession({
				parentSessionId,
				task,
				label,
				agentId,
				model,
			});

			return makeToolResult({
				success: true,
				message: "Child session spawned successfully.",
				parentSessionId,
				spawned,
				agentId: agentId ?? null,
				model: model ?? null,
				runTimeoutSeconds: runTimeoutSeconds ?? null,
				cleanup: cleanup ?? true,
			});
		},
	);

	server.registerTool(
		"session_status",
		{
			title: "Session Status",
			description:
				"Read or update session runtime status and model override for orchestration control.",
			inputSchema: sessionStatusInputSchema,
			outputSchema: sessionStatusOutputSchema,
			annotations: {
				title: "Session Status",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ sessionKey, status, model }) => {
			const currentSessionId = getCurrentSessionId(deps.getCurrentSessionId);
			const target = chooseSessionKey({
				explicitSessionKey: sessionKey,
				currentSessionId,
			});
			if (!target) {
				return makeToolResult(
					{
						success: false,
						message: "No session is available.",
						sessionId: null,
						sessionKey: null,
						status: null,
						modelOverride: null,
					},
					true,
				);
			}

			if (!status && !model) {
				const current = deps.sessionRegistry.getStatus(target);
				if (!current) {
					return makeToolResult(
						{
							success: false,
							message: "Target session not found.",
							sessionId: null,
							sessionKey: null,
							status: null,
							modelOverride: null,
						},
						true,
					);
				}
				return makeToolResult({
					success: true,
					message: "Session status retrieved.",
					sessionId: current.sessionId,
					sessionKey: current.sessionKey,
					status: castSessionStatus(current.status),
					modelOverride: current.modelOverride,
				});
			}

			const resolvedModelOverride =
				model === undefined ? undefined : model === "default" ? null : model;
			const updated = deps.sessionRegistry.setStatus({
				sessionKeyOrId: target,
				status,
				modelOverride: resolvedModelOverride,
			});
			if (!updated) {
				return makeToolResult(
					{
						success: false,
						message: "Target session not found.",
						sessionId: null,
						sessionKey: null,
						status: null,
						modelOverride: null,
					},
					true,
				);
			}

			return makeToolResult({
				success: true,
				message: "Session status updated.",
				sessionId: updated.sessionId,
				sessionKey: updated.sessionKey,
				status: castSessionStatus(updated.status),
				modelOverride: updated.modelOverride,
			});
		},
	);
}
