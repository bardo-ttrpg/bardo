import { parseJsonObject } from "../../../domain/campaign/json";
import { parseMarkdown } from "../../../domain/markdown/markdown";
import { readTextIfExists } from "../../../infra/filesystem/filesystem";
import type { DiceRoller, OptionalSystems } from "./types";
import { defaultOptionalSystems } from "./types";

export type PendingInitInputs = {
	diceRoller: DiceRoller | null;
	theme: string | null;
	startingScene: string | null;
};

export function normalizeTheme(input: string | undefined): string | null {
	const trimmed = input?.trim();
	return trimmed ? trimmed : null;
}

export function normalizeSavedDiceRoller(value: unknown): DiceRoller | null {
	if (value === "player" || value === "bardo") {
		return value;
	}
	return null;
}

export function normalizeSavedOptionalSystems(value: unknown): OptionalSystems {
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

export function mergeOptionalSystems(
	base: OptionalSystems,
	override: Partial<OptionalSystems> | undefined,
): OptionalSystems {
	if (!override) return { ...base };
	return {
		npcs: override.npcs ?? base.npcs,
		quests: override.quests ?? base.quests,
		items: override.items ?? base.items,
		worldGeneration: override.worldGeneration ?? base.worldGeneration,
	};
}

export function normalizePendingInitInputs(value: unknown): PendingInitInputs {
	if (typeof value !== "object" || value === null) {
		return {
			diceRoller: null,
			theme: null,
			startingScene: null,
		};
	}

	const record = value as Record<string, unknown>;
	return {
		diceRoller: normalizeSavedDiceRoller(record.diceRoller),
		theme:
			typeof record.theme === "string" && record.theme.trim().length > 0
				? record.theme.trim()
				: null,
		startingScene:
			typeof record.startingScene === "string" &&
			record.startingScene.trim().length > 0
				? record.startingScene.trim()
				: null,
	};
}

export async function readJsonMarkdown(filePath: string): Promise<{
	frontmatter: Record<string, string>;
	data: Record<string, unknown>;
}> {
	const raw = await readTextIfExists(filePath);
	if (raw === null) {
		return { frontmatter: {}, data: {} };
	}

	const parsed = parseMarkdown(raw);
	const data = parseJsonObject(parsed.content.trim()) ?? {};
	return { frontmatter: parsed.frontmatter, data };
}
