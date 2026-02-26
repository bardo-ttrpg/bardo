import { writeFile } from "node:fs/promises";
import {
	parseMarkdown,
	renderMarkdown,
} from "../../../domain/markdown/markdown";
import {
	ensureParentDirectoryExists,
	readTextIfExists,
} from "../../../infra/filesystem/filesystem";
import { buildWorkspaceBasedScene, generateProceduralMap } from "./map";
import type { InitPaths } from "./paths";
import { resolveSceneSpawnFromState } from "./persistence";
import type { InitOutput } from "./schemas";
import {
	applySpawnToScene,
	chooseRandomSpawn,
	inferLocationSlug,
	locationCandidatesFromMapData,
} from "./spawn";
import type {
	LocationCandidate,
	SpawnSelection,
	WorkspaceHint,
	WorkspaceSummary,
} from "./types";
import {
	ensureLocationMarkdownFile,
	listLocationCandidates,
	readMapLocationCandidates,
} from "./workspace";

type SceneResolution = {
	startingSceneContent: string;
	startingSceneSource: InitOutput["startingSceneSource"];
	mapGenerated: boolean;
	spawnSelection: SpawnSelection | null;
	startingLocationName: string;
	startingLocationSlug: string;
};

export async function resolveStartingScene(args: {
	bardoRoot: string;
	paths: InitPaths;
	summary: WorkspaceSummary;
	hint: WorkspaceHint;
	resolvedTheme: string | null;
	startingSceneInput: string | undefined;
	nextPrompts: string[];
}): Promise<SceneResolution> {
	const existingSceneRaw = await readTextIfExists(args.paths.scenePath);
	const existingSceneContent = existingSceneRaw
		? parseMarkdown(existingSceneRaw).content.trim()
		: "";
	const workspaceLocationCandidates = await listLocationCandidates(
		args.bardoRoot,
	);
	const existingMapCandidates = await readMapLocationCandidates(
		args.paths.mapPath,
	);

	let startingSceneContent = "";
	let startingSceneSource: InitOutput["startingSceneSource"] = "not_available";
	let shouldPersistScene = false;
	let mapGenerated = false;
	let spawnSelection: SpawnSelection | null = null;
	let mapCandidatesForSpawn: LocationCandidate[] = existingMapCandidates;
	let startingLocationName = args.hint.firstLocationName ?? "Starting Area";
	let startingLocationSlug =
		args.hint.firstLocationSlug ?? inferLocationSlug(startingLocationName);

	if (
		typeof args.startingSceneInput === "string" &&
		args.startingSceneInput.trim()
	) {
		startingSceneContent = args.startingSceneInput.trim();
		startingSceneSource = "user_provided";
		shouldPersistScene = true;
	} else if (existingSceneContent) {
		startingSceneContent = existingSceneContent;
		startingSceneSource = "existing_scene_reused";
		const stateSpawn = await resolveSceneSpawnFromState(
			args.paths.statePath,
			startingLocationName,
			startingLocationSlug,
		);
		startingLocationName = stateSpawn.locationName;
		startingLocationSlug = stateSpawn.locationSlug;
		spawnSelection = stateSpawn.spawn;
	} else if (
		args.summary.worldLocationFiles > 0 ||
		args.summary.worldInformativeFiles > 0
	) {
		const derived = buildWorkspaceBasedScene(args.hint, args.resolvedTheme);
		startingSceneContent = derived.sceneText;
		startingSceneSource = "generated_from_workspace";
		shouldPersistScene = true;
		startingLocationName = derived.locationName;
		startingLocationSlug = derived.locationSlug;
	} else if (!args.resolvedTheme) {
		args.nextPrompts.push(
			"What game theme/category are you playing (for example: fantasy, sci-fi, post-apocalyptic, horror)? I need this to generate a coherent world map and starting scene.",
		);
	} else {
		const generated = generateProceduralMap(args.resolvedTheme);
		startingSceneContent = generated.sceneText;
		startingSceneSource = "generated_from_theme_map";
		shouldPersistScene = true;
		mapGenerated = true;
		startingLocationName = generated.startingLocationName;
		startingLocationSlug = generated.startingLocationSlug;
		mapCandidatesForSpawn = locationCandidatesFromMapData(generated.mapData);

		await ensureParentDirectoryExists(args.paths.mapPath);
		await writeFile(
			args.paths.mapPath,
			renderMarkdown(
				{
					description:
						"Primary world map and world elements generated from selected game theme",
					title: "Primary Map",
				},
				JSON.stringify(generated.mapData, null, 2),
			),
			"utf8",
		);

		for (const mapLocation of mapCandidatesForSpawn) {
			await ensureLocationMarkdownFile(
				args.bardoRoot,
				mapLocation.slug,
				mapLocation.name,
			);
		}
	}

	if (
		!startingSceneContent &&
		!args.summary.workspaceEmpty &&
		args.summary.informativeFiles === 0
	) {
		args.nextPrompts.push(
			"Your workspace has files but content is too vague to start safely. Add clearer world/party/rules details or provide a direct starting scene.",
		);
	}

	if (shouldPersistScene) {
		spawnSelection = chooseRandomSpawn(
			args.resolvedTheme,
			workspaceLocationCandidates,
			mapCandidatesForSpawn,
		);
		startingLocationName = spawnSelection.name;
		startingLocationSlug = spawnSelection.slug;
		startingSceneContent = applySpawnToScene(
			startingSceneContent,
			spawnSelection,
		);
		await ensureParentDirectoryExists(args.paths.scenePath);
		await writeFile(
			args.paths.scenePath,
			renderMarkdown(
				{
					description: "Opening scene used to start the campaign",
					title: "Starting Scene",
				},
				startingSceneContent,
			),
			"utf8",
		);
	}

	return {
		startingSceneContent,
		startingSceneSource,
		mapGenerated,
		spawnSelection,
		startingLocationName,
		startingLocationSlug,
	};
}
