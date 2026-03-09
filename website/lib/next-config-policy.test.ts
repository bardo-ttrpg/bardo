import { describe, expect, test } from "bun:test";
import {
	resolveSentryBuildSilence,
	resolveShouldUploadSentryArtifacts,
} from "./next-config-policy";

describe("resolveShouldUploadSentryArtifacts", () => {
	test("disables artifact uploads for local ad-hoc development", () => {
		expect(
			resolveShouldUploadSentryArtifacts({
				NODE_ENV: "development",
			}),
		).toBe(false);
		expect(
			resolveSentryBuildSilence({
				NODE_ENV: "development",
			}),
		).toBe(true);
	});

	test("enables artifact uploads in enforced release contexts", () => {
		expect(
			resolveShouldUploadSentryArtifacts({
				CI: "true",
			}),
		).toBe(true);
		expect(
			resolveShouldUploadSentryArtifacts({
				VERCEL_ENV: "preview",
			}),
		).toBe(true);
		expect(
			resolveShouldUploadSentryArtifacts({
				BARDO_ENFORCE_SENTRY_RELEASE_HEALTH: "true",
			}),
		).toBe(true);
	});
});
