import { d20v1RulesetAdapter } from "./d20-v1";
import {
	buildWorkspaceRulesetAdapter,
	loadWorkspaceRulesetEntries,
} from "./manifest";
import { narrativeV1RulesetAdapter } from "./narrative-v1";
import type { RulesetAdapter, RulesetCatalog } from "./types";

const BUILTIN_RULESET_ADAPTERS = new Map<string, RulesetAdapter>([
	[d20v1RulesetAdapter.id, d20v1RulesetAdapter],
	[narrativeV1RulesetAdapter.id, narrativeV1RulesetAdapter],
]);

type RulesetRegistryOptions = {
	bardoRoot?: string;
};

function listWorkspaceAdapters(
	options: RulesetRegistryOptions = {},
): RulesetAdapter[] {
	return loadWorkspaceRulesetEntries(options.bardoRoot).map(
		buildWorkspaceRulesetAdapter,
	);
}

export function resolveRulesetCatalog(
	options: RulesetRegistryOptions = {},
): RulesetCatalog {
	const workspaceAdapters = listWorkspaceAdapters(options);
	const workspaceIds = new Set(workspaceAdapters.map((adapter) => adapter.id));
	const builtinAdapters = Array.from(BUILTIN_RULESET_ADAPTERS.values()).filter(
		(adapter) => !workspaceIds.has(adapter.id),
	);

	return {
		rulesets: [...workspaceAdapters, ...builtinAdapters].map((adapter) => ({
			id: adapter.id,
			title: adapter.title,
			sourceType: adapter.sourceType,
			capabilities: adapter.capabilities,
			actionTypes: adapter.actionTypes,
		})),
	};
}

export function resolveRulesetAdapter(
	rulesetId: string,
	options: RulesetRegistryOptions = {},
): RulesetAdapter {
	const normalized = rulesetId.trim();
	const workspaceAdapter = listWorkspaceAdapters(options).find(
		(adapter) => adapter.id === normalized,
	);
	if (workspaceAdapter) {
		return workspaceAdapter;
	}

	const adapter = BUILTIN_RULESET_ADAPTERS.get(normalized);
	if (!adapter) {
		throw new Error(
			`Unsupported ruleset '${rulesetId}'. Supported rulesets: ${resolveRulesetCatalog(options).rulesets
				.map((entry) => entry.id)
				.join(", ")}.`,
		);
	}
	return adapter;
}

export function listRulesetAdapters(
	options: RulesetRegistryOptions = {},
): RulesetAdapter[] {
	return resolveRulesetCatalog(options).rulesets.map((entry) =>
		resolveRulesetAdapter(entry.id, options),
	);
}
