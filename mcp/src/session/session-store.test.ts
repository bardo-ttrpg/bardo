import { describe, expect, test } from "bun:test";
import type { Session } from "../types/contracts";
import { SessionStore } from "./session-store";

function createSession(): Session {
	return {
		apiKey: "k1",
		campaignBasePath: "/repo/customers/a",
		server: {} as Session["server"],
		transport: {} as Session["transport"],
	};
}

describe("SessionStore", () => {
	test("expires sessions after ttl", () => {
		const store = new SessionStore({ sessionTtlMs: 1000 });
		store.set("s1", createSession(), 0);

		expect(store.get("s1", 999)).toBeDefined();
		expect(store.get("s1", 1001)).toBeUndefined();
	});

	test("touch extends ttl", () => {
		const store = new SessionStore({ sessionTtlMs: 1000 });
		store.set("s1", createSession(), 0);

		expect(store.touch("s1", 900)).toBe(true);
		expect(store.get("s1", 1500)).toBeDefined();
		expect(store.get("s1", 1901)).toBeUndefined();
	});

	test("sweepExpired removes expired sessions and reports count", () => {
		const store = new SessionStore({ sessionTtlMs: 1000 });
		store.set("s1", createSession(), 0);
		store.set("s2", createSession(), 200);

		const removed = store.sweepExpired(1199);
		expect(removed).toBe(1);
		expect(store.get("s1", 1199)).toBeUndefined();
		expect(store.get("s2", 1199)).toBeDefined();
	});
});
