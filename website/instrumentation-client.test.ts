import { describe, expect, test } from "bun:test";
import { onRouterTransitionStart } from "./instrumentation-client";

describe("instrumentation-client", () => {
	test("exports a stable router transition hook", () => {
		expect(typeof onRouterTransitionStart).toBe("function");
	});
});
