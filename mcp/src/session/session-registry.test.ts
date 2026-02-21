import { describe, expect, test } from "bun:test";
import type { LoopDetectionPolicy } from "../domain/config/loop-detection";
import { SessionRegistry } from "./session-registry";

function createLoopPolicy(
	overrides: Partial<LoopDetectionPolicy> = {},
): LoopDetectionPolicy {
	return {
		enabled: true,
		historySize: 20,
		warningThreshold: 3,
		criticalThreshold: 5,
		globalCircuitBreakerThreshold: 6,
		...overrides,
	};
}

describe("SessionRegistry", () => {
	test("registers, lists, and resolves sessions by key", () => {
		const registry = new SessionRegistry({ loopPolicy: createLoopPolicy() });
		registry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo",
		});

		const list = registry.listSessions({ limit: 10 });
		expect(list.length).toBe(1);
		expect(list[0]?.sessionKey).toBe("main");
		expect(registry.resolveSessionId("main")).toBe("s1");
	});

	test("stores and returns history", () => {
		const registry = new SessionRegistry({ loopPolicy: createLoopPolicy() });
		registry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo",
		});
		registry.recordJsonRpc({
			sessionId: "s1",
			method: "tools/call",
			toolName: "context_query",
		});

		const history = registry.getHistory({
			sessionKeyOrId: "main",
			limit: 10,
			includeTools: true,
		});
		expect(history.length).toBeGreaterThan(0);
		expect(history.some((entry) => entry.type === "jsonrpc")).toBe(true);
	});

	test("sends messages between sessions", () => {
		const registry = new SessionRegistry({ loopPolicy: createLoopPolicy() });
		registry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo",
		});
		registry.registerSession({
			sessionId: "s2",
			apiKey: "k2",
			campaignBasePath: "/repo",
		});

		const send = registry.sendMessage({
			fromSessionId: "s1",
			targetSessionKeyOrId: "s2",
			message: "hello",
		});
		expect(send.accepted).toBe(true);
		expect(send.delivered).toBe(true);
	});

	test("creates spawned agent sessions", () => {
		const registry = new SessionRegistry({ loopPolicy: createLoopPolicy() });
		registry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo",
		});

		const spawn = registry.spawnSession({
			parentSessionId: "s1",
			task: "Research this city",
			label: "Research",
		});
		expect(spawn.sessionId.startsWith("spawn_")).toBe(true);
		expect(spawn.kind).toBe("agent");
		expect(registry.resolveSessionId(spawn.sessionKey)).toBe(spawn.sessionId);
	});

	test("trips loop protection on repeated tool signatures", () => {
		const registry = new SessionRegistry({
			loopPolicy: createLoopPolicy({
				warningThreshold: 2,
				criticalThreshold: 3,
				globalCircuitBreakerThreshold: 4,
			}),
		});
		registry.registerSession({
			sessionId: "s1",
			apiKey: "k1",
			campaignBasePath: "/repo",
		});

		const first = registry.recordToolCallAndCheckLoop({
			sessionId: "s1",
			toolName: "context_query",
			argsHash: "abc",
		});
		const second = registry.recordToolCallAndCheckLoop({
			sessionId: "s1",
			toolName: "context_query",
			argsHash: "abc",
		});
		const third = registry.recordToolCallAndCheckLoop({
			sessionId: "s1",
			toolName: "context_query",
			argsHash: "abc",
		});

		expect(first.blocked).toBe(false);
		expect(second.warning).toBe(true);
		expect(third.blocked).toBe(true);
	});
});
