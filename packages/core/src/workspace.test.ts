import path from "node:path";
import { describe, expect, test } from "vitest";
import {
	BARDO_ROOT_DIRNAME,
	MIGRATED_ROOT_DIRNAME,
	resolveBardoRoot,
	resolveLegacyBardoRoot,
} from "./workspace";

describe("workspace root contract", () => {
	test("uses .bardo as the canonical managed root", () => {
		expect(BARDO_ROOT_DIRNAME).toBe(".bardo");
		expect(resolveBardoRoot("/tmp/campaign")).toBe(
			path.join("/tmp/campaign", ".bardo"),
		);
	});

	test("ignores legacy flat-layout environment overrides", () => {
		expect(
			resolveBardoRoot("/tmp/campaign", {
				BARDO_WORKSPACE_LAYOUT: "flat",
			}),
		).toBe(path.join("/tmp/campaign", ".bardo"));
	});

	test("keeps the legacy bardo path available only for migration", () => {
		expect(MIGRATED_ROOT_DIRNAME).toBe("bardo");
		expect(resolveLegacyBardoRoot("/tmp/campaign")).toBe(
			path.join("/tmp/campaign", "bardo"),
		);
	});
});
