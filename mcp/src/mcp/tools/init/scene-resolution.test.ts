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
		expect(nextPrompts[0]).toContain("Fantasy");
		expect(nextPrompts[0]).toContain("Sci-Fi");
		expect(nextPrompts[0]).toContain("Horror");
		expect(nextPrompts[0]).toContain("Post-Apocalyptic");
		expect(nextPrompts[0]).toContain("Mystery & Investigation");
		expect(nextPrompts[0]).toContain("Type your own answer");

		await rm(root, { recursive: true, force: true });
	});

	test("keeps the named frontier town from an explicit starting scene", async () => {
		const root = await makeTempRoot("bardo-scene-explicit-location-");
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
			resolvedTheme: "Classic Fantasy",
			startingSceneInput:
				"The sun sinks below the horizon across Thornwick, a frontier town at dusk where the Warm Hearth tavern glows against the cold wind.",
			nextPrompts,
		});

		expect(result.startingSceneSource).toBe("user_provided");
		expect(result.startingLocationName).toBe("Thornwick");
		expect(result.startingLocationSlug).toBe("thornwick");
		expect(result.startingSceneContent).toContain("Thornwick");
		expect(nextPrompts).toHaveLength(0);

		await rm(root, { recursive: true, force: true });
	});

	test("extracts the frontier town name from the full custom starting prompt shape", async () => {
		const root = await makeTempRoot("bardo-scene-full-prompt-location-");
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
			resolvedTheme: "Classic Fantasy",
			startingSceneInput:
				"The sun sinks below the horizon, casting long shadows across the cobblestone streets of Thornwick. This frontier town sits at the edge of the known lands, where wilderness presses close against civilization.",
			nextPrompts,
		});

		expect(result.startingSceneSource).toBe("user_provided");
		expect(result.startingLocationName).toBe("Thornwick");
		expect(result.startingLocationSlug).toBe("thornwick");

		await rm(root, { recursive: true, force: true });
	});

	test("extracts the named town from prompts that describe the area surrounding it", async () => {
		const root = await makeTempRoot("bardo-scene-surrounding-town-");
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
			resolvedTheme: "Classic Fantasy",
			startingSceneInput:
				"The sun sinks below the hills surrounding Thornwick, casting long shadows across the cobblestone streets. The frontier town awakens as lanterns flicker to life in windows.",
			nextPrompts,
		});

		expect(result.startingSceneSource).toBe("user_provided");
		expect(result.startingLocationName).toBe("Thornwick");
		expect(result.startingLocationSlug).toBe("thornwick");
		expect(result.startingSceneContent).not.toContain(
			"You begin in the middle of nowhere",
		);

		await rm(root, { recursive: true, force: true });
	});
});
