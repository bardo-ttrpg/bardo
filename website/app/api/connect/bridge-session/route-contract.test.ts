import { describe, expect, test } from "bun:test";

describe("bridge-session routes", () => {
	test("export node runtime directly for the canonical bridge-session endpoints", async () => {
		const bridgeStart = await import("./start/route");
		const bridgeApprove = await import("./approve/route");
		const bridgePoll = await import("./poll/route");

		expect(bridgeStart.runtime).toBe("nodejs");
		expect(bridgeApprove.runtime).toBe("nodejs");
		expect(bridgePoll.runtime).toBe("nodejs");
	});
});
