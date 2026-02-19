import type { Session } from "../types/contracts";

type SessionStoreOptions = {
	sessionTtlMs?: number;
	onEvictSession?: (sessionId: string, session: Session) => void;
};

export class SessionStore {
	private readonly sessions = new Map<string, Session>();
	private readonly sessionExpiry = new Map<string, number>();
	private readonly sessionTtlMs: number;
	private readonly onEvictSession:
		| ((sessionId: string, session: Session) => void)
		| null;

	constructor(options: SessionStoreOptions = {}) {
		this.sessionTtlMs = options.sessionTtlMs ?? 0;
		this.onEvictSession = options.onEvictSession ?? null;
	}

	get(sessionId: string, now = Date.now()): Session | undefined {
		if (this.isExpired(sessionId, now)) {
			this.delete(sessionId);
			return undefined;
		}
		return this.sessions.get(sessionId);
	}

	set(sessionId: string, session: Session, now = Date.now()): void {
		this.sessions.set(sessionId, session);
		if (this.sessionTtlMs > 0) {
			this.sessionExpiry.set(sessionId, now + this.sessionTtlMs);
		}
	}

	touch(sessionId: string, now = Date.now()): boolean {
		if (!this.sessions.has(sessionId)) return false;
		if (this.sessionTtlMs <= 0) return true;
		this.sessionExpiry.set(sessionId, now + this.sessionTtlMs);
		return true;
	}

	delete(sessionId: string): boolean {
		const existing = this.sessions.get(sessionId);
		this.sessionExpiry.delete(sessionId);
		const deleted = this.sessions.delete(sessionId);
		if (deleted && existing && this.onEvictSession) {
			this.onEvictSession(sessionId, existing);
		}
		return deleted;
	}

	sweepExpired(now = Date.now()): number {
		if (this.sessionTtlMs <= 0) return 0;

		let removed = 0;
		for (const [sessionId, expiresAt] of this.sessionExpiry.entries()) {
			if (now >= expiresAt && this.delete(sessionId)) {
				removed += 1;
			}
		}
		return removed;
	}

	asMap(now = Date.now()): Map<string, Session> {
		this.sweepExpired(now);
		return this.sessions;
	}

	private isExpired(sessionId: string, now: number): boolean {
		if (this.sessionTtlMs <= 0) return false;
		const expiresAt = this.sessionExpiry.get(sessionId);
		return expiresAt !== undefined && now >= expiresAt;
	}
}
