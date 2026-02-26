import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveBardoRoot } from "../../../infra/filesystem/filesystem";
import { resolveInitPaths } from "./paths";
import { resolveStartingScene } from "./scene-resolution";

async function makeTempRoot(prefix: string): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("resolveStartingScene", () => {
	test("asks theme question using curated setup options when theme is missing", async () => {
		const root = await makeTempRoot("bardo-scene-theme-question-");
		const campaignRoot = root;
		const bardoRoot = resolveBardoRoot(campaignRoot);
		await mkdir(bardoRoot, { recursive: true });
		const paths = resolveInitPaths(bardoRoot);
		const nextPrompts: string[] = [];

		const result = await resolveStartingScene({
			bardoRoot,
			paths,
			summary: {
				markdownFiles: 0,
				informativeFiles: 0,
				totalContentChars: 0,
				informativeByDirectory: {},
				looksSufficientForAutoScene: false,
				worldLocationFiles: 0,
				worldInformativeFiles: 0,
				workspaceEmpty: true,
			},
			hint: {
				firstLocationName: null,
				firstLocationSlug: null,
				firstQuestTitle: null,
				firstPartyTitle: null,
			},
			resolvedTheme: null,
			startingSceneInput: undefined,
			nextPrompts,
		});

		expect(result.startingSceneSource).toBe("not_available");
		expect(nextPrompts[0]).toContain("What theme are we playing?");
		expect(nextPrompts[0]).toContain("High Fantasy");
		expect(nextPrompts[0]).toContain("Post Apocalyptic");
		expect(nextPrompts[0]).toContain("Sci-fi");
		expect(nextPrompts[0]).toContain("Investigation");
		expect(nextPrompts[0]).toContain("Type your own answer");

		await rm(root, { recursive: true, force: true });
	});
});
