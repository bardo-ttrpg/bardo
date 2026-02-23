import {
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import { parseMarkdown } from "../markdown/markdown";
import { parseJsonObject } from "./json";
import type { OptionalSystems } from "./types";

export const defaultOptionalSystems: OptionalSystems = {
	npcs: true,
	quests: true,
	items: true,
	worldGeneration: true,
};

function normalizeOptionalSystems(value: unknown): OptionalSystems {
	if (typeof value !== "object" || value === null) {
		return { ...defaultOptionalSystems };
	}
	const record = value as Record<string, unknown>;
	return {
		npcs:
			typeof record.npcs === "boolean"
				? record.npcs
				: defaultOptionalSystems.npcs,
		quests:
			typeof record.quests === "boolean"
				? record.quests
				: defaultOptionalSystems.quests,
		items:
			typeof record.items === "boolean"
				? record.items
				: defaultOptionalSystems.items,
		worldGeneration:
			typeof record.worldGeneration === "boolean"
				? record.worldGeneration
				: defaultOptionalSystems.worldGeneration,
	};
}

export async function loadOptionalSystems(
	bardoRoot: string,
): Promise<OptionalSystems> {
	const settingsPath = resolvePathInsideRoot(
		bardoRoot,
		"_settings/settings.md",
	);
	const legacySettingsPath = resolvePathInsideRoot(
		bardoRoot,
		"state/settings.md",
	);

	for (const filePath of [settingsPath, legacySettingsPath]) {
		const raw = await readTextIfExists(filePath);
		if (raw === null) continue;
		const parsed = parseMarkdown(raw);
		const data = parseJsonObject(parsed.content.trim());
		if (data && "optionalSystems" in data) {
			return normalizeOptionalSystems(data.optionalSystems);
		}
	}

	return { ...defaultOptionalSystems };
}
