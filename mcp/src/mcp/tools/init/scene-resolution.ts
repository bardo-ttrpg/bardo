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
import { THEME_SETUP_QUESTION } from "./setup-prompts";
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

function inferExplicitSceneLocation(scene: string): {
	locationName: string;
	locationSlug: string;
} | null {
	const stopwords = new Set(["The", "A", "An", "This", "That", "What"]);
	const patterns = [
		/\bcalled\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3}),\s+a\s+(?:frontier\s+)?(?:town|village|city|outpost|hamlet)\b/,
		/\b([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\.\s+This\s+(?:frontier\s+)?(?:town|village|city|outpost|hamlet)\b/,
		/\b(?:town|village|city|outpost|hamlet)\s+of\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b(?:surrounding|outside|beyond|near|around)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b(?:streets?|roads?|walls?|gates?)\s+of\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b(?:across|in|at|inside|within)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b(?:arrive at|begin at|stand in|inside|within)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
		/\b([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,3})\b/,
	];

	for (const pattern of patterns) {
		const match = scene.match(pattern);
		const raw = match?.[1]?.trim();
		if (!raw || stopwords.has(raw)) {
			continue;
		}
		return {
			locationName: raw,
			locationSlug: inferLocationSlug(raw),
		};
	}
	return null;
}

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
		const inferredLocation = inferExplicitSceneLocation(startingSceneContent);
		if (inferredLocation) {
			startingLocationName = inferredLocation.locationName;
			startingLocationSlug = inferredLocation.locationSlug;
			spawnSelection = {
				slug: inferredLocation.locationSlug,
				name: inferredLocation.locationName,
				origin: "workspace",
			};
		}
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
		args.nextPrompts.push(THEME_SETUP_QUESTION);
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
		if (startingSceneSource === "user_provided" && spawnSelection) {
			startingSceneContent = applySpawnToScene(
				startingSceneContent,
				spawnSelection,
			);
		} else {
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
		}
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
