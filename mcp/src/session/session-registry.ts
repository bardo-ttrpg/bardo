import {
	LOOP_DETECTION_POLICY,
	type LoopDetectionPolicy,
} from "../domain/config/loop-detection";

export type SessionKind = "main" | "agent";
export type SessionStatus = "active" | "idle" | "queued" | "closed";

export type SessionHistoryEntry = {
	at: number;
	type:
		| "jsonrpc"
		| "tool"
		| "message"
		| "spawn"
		| "status"
		| "loop-warning"
		| "loop-blocked";
	summary: string;
	data?: Record<string, unknown>;
};

export type SessionListItem = {
	sessionId: string;
	sessionKey: string;
	kind: SessionKind;
	status: SessionStatus;
	createdAt: number;
	updatedAt: number;
	modelOverride: string | null;
	pendingMessages: number;
};

type SessionMessage = {
	id: string;
	fromSessionId: string;
	toSessionId: string;
	message: string;
	createdAt: number;
};

type LoopRecord = {
	signature: string;
	toolName: string;
	at: number;
};

type SessionRecord = {
	sessionId: string;
	sessionKey: string;
	kind: SessionKind;
	status: SessionStatus;
	apiKey: string | null;
	campaignBasePath: string;
	createdAt: number;
	updatedAt: number;
	modelOverride: string | null;
	messages: SessionMessage[];
	history: SessionHistoryEntry[];
	loopRecords: LoopRecord[];
};

function toKeySlug(input: string): string {
	const normalized = input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "agent";
}

function trimArray<T>(arr: T[], limit: number): void {
	if (arr.length <= limit) return;
	arr.splice(0, arr.length - limit);
}

export class SessionRegistry {
	private readonly sessions = new Map<string, SessionRecord>();
	private readonly keyToSessionId = new Map<string, string>();
	private readonly loopPolicy: LoopDetectionPolicy;

	constructor(options?: { loopPolicy?: LoopDetectionPolicy }) {
		this.loopPolicy = options?.loopPolicy ?? LOOP_DETECTION_POLICY;
	}

	registerSession(args: {
		sessionId: string;
		apiKey: string | null;
		campaignBasePath: string;
		kind?: SessionKind;
		sessionKey?: string | null;
		now?: number;
	}): SessionListItem {
		const now = args.now ?? Date.now();
		const existing = this.sessions.get(args.sessionId);
		if (existing) {
			existing.updatedAt = now;
			existing.status = "active";
			return this.toListItem(existing);
		}

		const kind = args.kind ?? "main";
		const sessionKey = this.buildSessionKey({
			sessionId: args.sessionId,
			kind,
			hint: args.sessionKey,
		});

		const record: SessionRecord = {
			sessionId: args.sessionId,
			sessionKey,
			kind,
			status: "active",
			apiKey: args.apiKey,
			campaignBasePath: args.campaignBasePath,
			createdAt: now,
			updatedAt: now,
			modelOverride: null,
			messages: [],
			history: [],
			loopRecords: [],
		};

		this.sessions.set(args.sessionId, record);
		this.keyToSessionId.set(sessionKey, args.sessionId);
		this.appendHistory(args.sessionId, {
			at: now,
			type: "status",
			summary: "Session registered.",
			data: {
				sessionKey,
				kind,
			},
		});
		return this.toListItem(record);
	}

	closeSession(sessionId: string, now = Date.now()): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.status = "closed";
		session.updatedAt = now;
		this.appendHistory(sessionId, {
			at: now,
			type: "status",
			summary: "Session closed.",
		});
	}

	touchSession(sessionId: string, now = Date.now()): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.updatedAt = now;
		if (session.status !== "closed") {
			session.status = "active";
		}
	}

	resolveSessionId(sessionKeyOrId: string): string | null {
		if (this.sessions.has(sessionKeyOrId)) {
			return sessionKeyOrId;
		}
		return this.keyToSessionId.get(sessionKeyOrId) ?? null;
	}

	listSessions(args: {
		kinds?: SessionKind[];
		limit?: number;
		activeMinutes?: number;
	}): SessionListItem[] {
		const kinds = args.kinds ?? [];
		const hasKindFilter = kinds.length > 0;
		const kindSet = new Set(kinds);
		const activeMinutes = args.activeMinutes ?? null;
		const activeCutoff =
			typeof activeMinutes === "number" && activeMinutes > 0
				? Date.now() - activeMinutes * 60_000
				: null;

		const rows = [...this.sessions.values()]
			.filter((session) => {
				if (hasKindFilter && !kindSet.has(session.kind)) {
					return false;
				}
				if (activeCutoff !== null && session.updatedAt < activeCutoff) {
					return false;
				}
				return true;
			})
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.map((session) => this.toListItem(session));

		const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
		return rows.slice(0, limit);
	}

	getHistory(args: {
		sessionKeyOrId: string;
		limit?: number;
		includeTools?: boolean;
	}): SessionHistoryEntry[] {
		const sessionId = this.resolveSessionId(args.sessionKeyOrId);
		if (!sessionId) {
			return [];
		}
		const session = this.sessions.get(sessionId);
		if (!session) {
			return [];
		}

		const includeTools = args.includeTools ?? true;
		const filtered = includeTools
			? session.history
			: session.history.filter(
					(entry) =>
						entry.type !== "tool" &&
						entry.type !== "loop-warning" &&
						entry.type !== "loop-blocked",
				);
		const limit = Math.max(1, Math.min(args.limit ?? 50, 500));
		return filtered.slice(Math.max(0, filtered.length - limit));
	}

	recordJsonRpc(args: {
		sessionId: string;
		method: string;
		toolName?: string | null;
		now?: number;
	}): void {
		const now = args.now ?? Date.now();
		this.touchSession(args.sessionId, now);
		const summary = args.toolName
			? `JSON-RPC ${args.method} (${args.toolName})`
			: `JSON-RPC ${args.method}`;
		this.appendHistory(args.sessionId, {
			at: now,
			type: "jsonrpc",
			summary,
			data: {
				method: args.method,
				toolName: args.toolName ?? null,
			},
		});
	}

	recordToolOutcome(args: {
		sessionId: string;
		toolName: string;
		status: "success" | "error";
		now?: number;
	}): void {
		const now = args.now ?? Date.now();
		this.touchSession(args.sessionId, now);
		this.appendHistory(args.sessionId, {
			at: now,
			type: "tool",
			summary: `${args.toolName} => ${args.status}`,
			data: {
				toolName: args.toolName,
				status: args.status,
			},
		});
	}

	recordToolCallAndCheckLoop(args: {
		sessionId: string;
		toolName: string;
		argsHash: string;
		now?: number;
	}): {
		blocked: boolean;
		warning: boolean;
		repeatCount: number;
		reason: string | null;
	} {
		const now = args.now ?? Date.now();
		if (!this.loopPolicy.enabled) {
			return {
				blocked: false,
				warning: false,
				repeatCount: 1,
				reason: null,
			};
		}

		const session = this.sessions.get(args.sessionId);
		if (!session) {
			return {
				blocked: false,
				warning: false,
				repeatCount: 1,
				reason: null,
			};
		}

		const signature = `${args.toolName}:${args.argsHash}`;
		session.loopRecords.push({
			signature,
			toolName: args.toolName,
			at: now,
		});
		trimArray(session.loopRecords, this.loopPolicy.historySize);

		let repeatCount = 0;
		for (let i = session.loopRecords.length - 1; i >= 0; i -= 1) {
			const loopRecord = session.loopRecords[i];
			if (!loopRecord || loopRecord.signature !== signature) {
				break;
			}
			repeatCount += 1;
		}

		if (repeatCount >= this.loopPolicy.globalCircuitBreakerThreshold) {
			const reason =
				"Loop circuit breaker tripped: repeating tool call pattern exceeded global threshold.";
			this.appendHistory(args.sessionId, {
				at: now,
				type: "loop-blocked",
				summary: reason,
				data: {
					toolName: args.toolName,
					repeatCount,
					threshold: this.loopPolicy.globalCircuitBreakerThreshold,
				},
			});
			return {
				blocked: true,
				warning: false,
				repeatCount,
				reason,
			};
		}

		if (repeatCount >= this.loopPolicy.criticalThreshold) {
			const reason =
				"Loop protection blocked this tool call: critical repeat threshold reached.";
			this.appendHistory(args.sessionId, {
				at: now,
				type: "loop-blocked",
				summary: reason,
				data: {
					toolName: args.toolName,
					repeatCount,
					threshold: this.loopPolicy.criticalThreshold,
				},
			});
			return {
				blocked: true,
				warning: false,
				repeatCount,
				reason,
			};
		}

		if (repeatCount >= this.loopPolicy.warningThreshold) {
			const reason =
				"Loop warning: repeating tool call pattern is approaching critical threshold.";
			this.appendHistory(args.sessionId, {
				at: now,
				type: "loop-warning",
				summary: reason,
				data: {
					toolName: args.toolName,
					repeatCount,
					threshold: this.loopPolicy.warningThreshold,
				},
			});
			return {
				blocked: false,
				warning: true,
				repeatCount,
				reason,
			};
		}

		return {
			blocked: false,
			warning: false,
			repeatCount,
			reason: null,
		};
	}

	sendMessage(args: {
		fromSessionId: string;
		targetSessionKeyOrId: string;
		message: string;
		now?: number;
	}): {
		accepted: boolean;
		delivered: boolean;
		messageId: string | null;
		targetSessionId: string | null;
	} {
		const now = args.now ?? Date.now();
		const targetSessionId = this.resolveSessionId(args.targetSessionKeyOrId);
		if (!targetSessionId) {
			return {
				accepted: false,
				delivered: false,
				messageId: null,
				targetSessionId: null,
			};
		}

		const target = this.sessions.get(targetSessionId);
		if (!target) {
			return {
				accepted: false,
				delivered: false,
				messageId: null,
				targetSessionId: null,
			};
		}

		const messageId = crypto.randomUUID();
		target.messages.push({
			id: messageId,
			fromSessionId: args.fromSessionId,
			toSessionId: targetSessionId,
			message: args.message,
			createdAt: now,
		});
		target.updatedAt = now;
		if (target.status !== "closed") {
			target.status = "active";
		}

		this.appendHistory(targetSessionId, {
			at: now,
			type: "message",
			summary: `Message received from ${args.fromSessionId}.`,
			data: {
				fromSessionId: args.fromSessionId,
				messageId,
			},
		});
		this.appendHistory(args.fromSessionId, {
			at: now,
			type: "message",
			summary: `Message sent to ${targetSessionId}.`,
			data: {
				toSessionId: targetSessionId,
				messageId,
			},
		});

		return {
			accepted: true,
			delivered: true,
			messageId,
			targetSessionId,
		};
	}

	spawnSession(args: {
		parentSessionId: string;
		task: string;
		label?: string;
		agentId?: string;
		model?: string;
		now?: number;
	}): SessionListItem {
		const now = args.now ?? Date.now();
		const sessionId = `spawn_${crypto.randomUUID()}`;
		const label = args.label?.trim() || "worker";
		const keyHint = `agent:${toKeySlug(label)}`;

		this.registerSession({
			sessionId,
			apiKey: null,
			campaignBasePath: "",
			kind: "agent",
			sessionKey: keyHint,
			now,
		});

		const record = this.sessions.get(sessionId);
		if (record) {
			record.status = "queued";
			record.modelOverride = args.model?.trim() || null;
			record.messages.push({
				id: crypto.randomUUID(),
				fromSessionId: args.parentSessionId,
				toSessionId: sessionId,
				message: args.task,
				createdAt: now,
			});
			record.updatedAt = now;
		}

		this.appendHistory(sessionId, {
			at: now,
			type: "spawn",
			summary: `Spawned by ${args.parentSessionId}.`,
			data: {
				parentSessionId: args.parentSessionId,
				agentId: args.agentId ?? null,
				model: args.model ?? null,
				task: args.task,
			},
		});
		this.appendHistory(args.parentSessionId, {
			at: now,
			type: "spawn",
			summary: `Spawned child session ${sessionId}.`,
			data: {
				childSessionId: sessionId,
				agentId: args.agentId ?? null,
				model: args.model ?? null,
			},
		});

		const created = this.sessions.get(sessionId);
		if (!created) {
			throw new Error("Failed to create spawned session record.");
		}
		return this.toListItem(created);
	}

	getStatus(sessionKeyOrId: string): {
		sessionId: string;
		sessionKey: string;
		status: SessionStatus;
		modelOverride: string | null;
	} | null {
		const sessionId = this.resolveSessionId(sessionKeyOrId);
		if (!sessionId) return null;
		const session = this.sessions.get(sessionId);
		if (!session) return null;
		return {
			sessionId: session.sessionId,
			sessionKey: session.sessionKey,
			status: session.status,
			modelOverride: session.modelOverride,
		};
	}

	setStatus(args: {
		sessionKeyOrId: string;
		status?: SessionStatus;
		modelOverride?: string | null;
		now?: number;
	}): {
		sessionId: string;
		sessionKey: string;
		status: SessionStatus;
		modelOverride: string | null;
	} | null {
		const sessionId = this.resolveSessionId(args.sessionKeyOrId);
		if (!sessionId) return null;
		const session = this.sessions.get(sessionId);
		if (!session) return null;

		const now = args.now ?? Date.now();
		if (args.status) {
			session.status = args.status;
		}
		if (args.modelOverride !== undefined) {
			session.modelOverride = args.modelOverride;
		}
		session.updatedAt = now;

		this.appendHistory(sessionId, {
			at: now,
			type: "status",
			summary: "Session status updated.",
			data: {
				status: session.status,
				modelOverride: session.modelOverride,
			},
		});

		return {
			sessionId: session.sessionId,
			sessionKey: session.sessionKey,
			status: session.status,
			modelOverride: session.modelOverride,
		};
	}

	private appendHistory(sessionId: string, entry: SessionHistoryEntry): void {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		session.history.push(entry);
		trimArray(session.history, 500);
	}

	private toListItem(session: SessionRecord): SessionListItem {
		return {
			sessionId: session.sessionId,
			sessionKey: session.sessionKey,
			kind: session.kind,
			status: session.status,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt,
			modelOverride: session.modelOverride,
			pendingMessages: session.messages.length,
		};
	}

	private buildSessionKey(args: {
		sessionId: string;
		kind: SessionKind;
		hint?: string | null;
	}): string {
		if (args.hint && args.hint.trim().length > 0) {
			return this.ensureUniqueKey(args.hint.trim(), args.sessionId);
		}

		if (args.kind === "main") {
			if (!this.keyToSessionId.has("main")) {
				return "main";
			}
			return this.ensureUniqueKey(
				`session:${args.sessionId.slice(0, 8)}`,
				args.sessionId,
			);
		}

		return this.ensureUniqueKey(
			`agent:${args.sessionId.slice(0, 8)}`,
			args.sessionId,
		);
	}

	private ensureUniqueKey(baseKey: string, sessionId: string): string {
		if (!this.keyToSessionId.has(baseKey)) {
			return baseKey;
		}
		let index = 2;
		while (true) {
			const candidate = `${baseKey}-${index}`;
			const mapped = this.keyToSessionId.get(candidate);
			if (!mapped || mapped === sessionId) {
				return candidate;
			}
			index += 1;
		}
	}
}
