import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BARDO_SUBDIRECTORIES } from "../../../domain/config/constants";
import { inspectPath } from "../../../infra/filesystem/filesystem";
import type { InitPaths } from "./paths";
import type { DirectoryReport, InitOutput } from "./schemas";
import { defaultOptionalSystems, type WorkspaceSummary } from "./types";

export type DirectorySetupResult = {
	rootExistedBefore: boolean;
	createdDirectories: string[];
	existingDirectories: string[];
	directories: DirectoryReport[];
	failureMessage: string | null;
};

export function emptyWorkspaceSummary(): WorkspaceSummary {
	return {
		markdownFiles: 0,
		informativeFiles: 0,
		totalContentChars: 0,
		informativeByDirectory: {},
		looksSufficientForAutoScene: false,
		worldLocationFiles: 0,
		worldInformativeFiles: 0,
		workspaceEmpty: true,
	};
}

export async function ensureInitDirectories(
	bardoRoot: string,
): Promise<DirectorySetupResult> {
	const directories: DirectoryReport[] = [];
	const createdDirectories: string[] = [];
	const existingDirectories: string[] = [];

	const rootStatus = await inspectPath(bardoRoot);
	if (rootStatus.exists && !rootStatus.isDirectory) {
		directories.push({
			name: "bardo",
			path: bardoRoot,
			existedBefore: true,
			createdNow: false,
			isDirectory: false,
		});
		return {
			rootExistedBefore: true,
			createdDirectories,
			existingDirectories,
			directories,
			failureMessage:
				"Initialization failed: `bardo` exists but is not a directory.",
		};
	}

	let rootCreatedNow = false;
	if (!rootStatus.exists) {
		await mkdir(bardoRoot, { recursive: true });
		rootCreatedNow = true;
		createdDirectories.push(bardoRoot);
	} else {
		existingDirectories.push(bardoRoot);
	}

	directories.push({
		name: "bardo",
		path: bardoRoot,
		existedBefore: rootStatus.exists,
		createdNow: rootCreatedNow,
		isDirectory: true,
	});

	for (const dir of BARDO_SUBDIRECTORIES) {
		const fullPath = path.join(bardoRoot, dir);
		const dirStatus = await inspectPath(fullPath);

		if (dirStatus.exists && !dirStatus.isDirectory) {
			directories.push({
				name: dir,
				path: fullPath,
				existedBefore: true,
				createdNow: false,
				isDirectory: false,
			});
			return {
				rootExistedBefore: rootStatus.exists,
				createdDirectories,
				existingDirectories,
				directories,
				failureMessage: `Initialization failed: \`${dir}\` exists but is not a directory.`,
			};
		}

		let createdNow = false;
		if (!dirStatus.exists) {
			await mkdir(fullPath, { recursive: true });
			createdNow = true;
			createdDirectories.push(fullPath);
		} else {
			existingDirectories.push(fullPath);
		}

		directories.push({
			name: dir,
			path: fullPath,
			existedBefore: dirStatus.exists,
			createdNow,
			isDirectory: true,
		});
	}

	return {
		rootExistedBefore: rootStatus.exists,
		createdDirectories,
		existingDirectories,
		directories,
		failureMessage: null,
	};
}

export function buildInitFailureOutput(args: {
	message: string;
	nextPrompts: string[];
	rootPath: string;
	rootExistedBefore: boolean;
	createdDirectories: string[];
	existingDirectories: string[];
	directories: DirectoryReport[];
	paths: InitPaths;
}): InitOutput {
	return {
		success: false,
		setupComplete: false,
		requiresUserInput: false,
		message: args.message,
		nextPrompts: args.nextPrompts,
		rootPath: args.rootPath,
		rootExistedBefore: args.rootExistedBefore,
		createdDirectories: args.createdDirectories,
		existingDirectories: args.existingDirectories,
		directories: args.directories,
		diceRoller: null,
		theme: null,
		optionalSystems: { ...defaultOptionalSystems },
		settingsPath: args.paths.settingsPath,
		legacySettingsPath: args.paths.legacySettingsPath,
		legacySettingsDetected: false,
		startingScenePath: args.paths.scenePath,
		mapPath: args.paths.mapPath,
		mapGenerated: false,
		startingSceneSource: "not_available",
		startingScenePreview: "",
		workspaceSummary: emptyWorkspaceSummary(),
		statePath: args.paths.statePath,
		historyPath: args.paths.historyPath,
	};
}
