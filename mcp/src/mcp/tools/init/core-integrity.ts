import { parseJsonObject } from "../../../domain/campaign/json";
import { BARDO_SUBDIRECTORIES } from "../../../domain/config/constants";
import { parseMarkdown } from "../../../domain/markdown/markdown";
import {
	inspectPath,
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../../infra/filesystem/filesystem";

export type CoreIntegrityResult = {
	ok: boolean;
	missingPaths: string[];
	invalidPaths: string[];
};

async function validateJsonMarkdownFile(filePath: string): Promise<boolean> {
	const raw = await readTextIfExists(filePath);
	if (raw === null) {
		return false;
	}
	const parsed = parseMarkdown(raw);
	return parseJsonObject(parsed.content.trim()) !== null;
}

async function validateHistoryFile(filePath: string): Promise<boolean> {
	const raw = await readTextIfExists(filePath);
	if (raw === null) {
		return false;
	}

	// History can be plain text markdown content; we only ensure it is parseable.
	parseMarkdown(raw);
	return true;
}

export async function validateCoreIntegrity(
	bardoRoot: string,
): Promise<CoreIntegrityResult> {
	const missingPaths: string[] = [];
	const invalidPaths: string[] = [];

	for (const subdirectory of BARDO_SUBDIRECTORIES) {
		const dirPath = resolvePathInsideRoot(bardoRoot, subdirectory);
		const status = await inspectPath(dirPath);
		if (!status.exists) {
			missingPaths.push(dirPath);
			continue;
		}
		if (!status.isDirectory) {
			invalidPaths.push(dirPath);
		}
	}

	const settingsPath = resolvePathInsideRoot(
		bardoRoot,
		"_settings/settings.md",
	);
	const statePath = resolvePathInsideRoot(bardoRoot, "state/current.md");
	const historyPath = resolvePathInsideRoot(bardoRoot, "state/history.md");

	for (const filePath of [settingsPath, statePath, historyPath]) {
		const status = await inspectPath(filePath);
		if (!status.exists) {
			missingPaths.push(filePath);
			continue;
		}
		if (status.isDirectory) {
			invalidPaths.push(filePath);
		}
	}

	if (
		!missingPaths.includes(settingsPath) &&
		!invalidPaths.includes(settingsPath)
	) {
		if (!(await validateJsonMarkdownFile(settingsPath))) {
			invalidPaths.push(settingsPath);
		}
	}

	if (!missingPaths.includes(statePath) && !invalidPaths.includes(statePath)) {
		if (!(await validateJsonMarkdownFile(statePath))) {
			invalidPaths.push(statePath);
		}
	}

	if (
		!missingPaths.includes(historyPath) &&
		!invalidPaths.includes(historyPath)
	) {
		if (!(await validateHistoryFile(historyPath))) {
			invalidPaths.push(historyPath);
		}
	}

	return {
		ok: missingPaths.length === 0 && invalidPaths.length === 0,
		missingPaths,
		invalidPaths,
	};
}
