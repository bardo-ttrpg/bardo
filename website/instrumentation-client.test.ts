import { describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/nextjs";
import { onRouterTransitionStart } from "./instrumentation-client";

describe("instrumentation-client", () => {
	test("exports Sentry router transition hook for navigation tracing", () => {
		expect(onRouterTransitionStart).toBe(Sentry.captureRouterTransitionStart);
	});
});
