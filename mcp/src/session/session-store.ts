import type { Session } from "../types/contracts";

export class SessionStore {
	private readonly sessions = new Map<string, Session>();

	get(sessionId: string): Session | undefined {
		return this.sessions.get(sessionId);
	}

	set(sessionId: string, session: Session): void {
		this.sessions.set(sessionId, session);
	}

	delete(sessionId: string): boolean {
		return this.sessions.delete(sessionId);
	}

	asMap(): Map<string, Session> {
		return this.sessions;
	}
}
