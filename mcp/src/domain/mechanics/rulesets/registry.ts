import { d20v1RulesetAdapter } from "./d20-v1";
import { narrativeV1RulesetAdapter } from "./narrative-v1";
import type { RulesetAdapter } from "./types";

const RULESET_ADAPTERS = new Map<string, RulesetAdapter>([
	[d20v1RulesetAdapter.id, d20v1RulesetAdapter],
	[narrativeV1RulesetAdapter.id, narrativeV1RulesetAdapter],
]);

export function resolveRulesetAdapter(rulesetId: string): RulesetAdapter {
	const normalized = rulesetId.trim();
	const adapter = RULESET_ADAPTERS.get(normalized);
	if (!adapter) {
		throw new Error(
			`Unsupported ruleset '${rulesetId}'. Supported rulesets: ${Array.from(RULESET_ADAPTERS.keys()).join(", ")}.`,
		);
	}
	return adapter;
}

export function listRulesetAdapters(): RulesetAdapter[] {
	return Array.from(RULESET_ADAPTERS.values());
}
