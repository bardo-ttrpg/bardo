export const KNOWN_TOOL_NAMES = [
	"init",
	"context_query",
	"player_action",
	"simulation_tick",
	"entity_crud",
	"location_crud",
	"faction_crud",
	"event_crud",
	"consistency_check",
	"markdown_read",
	"markdown_upsert",
	"state_get",
	"state_set",
	"world_sync",
	"sessions_list",
	"sessions_history",
	"sessions_send",
	"sessions_spawn",
	"session_status",
] as const;

type ToolName = (typeof KNOWN_TOOL_NAMES)[number];

export type ToolProfile = "minimal" | "standard" | "full";

export type ToolPolicyRule = {
	profile?: ToolProfile;
	allowTokens: string[];
	denyTokens: string[];
};

export type ToolPolicyConfig = {
	defaultProfile: ToolProfile;
	baseAllowTokens: string[];
	baseDenyTokens: string[];
	byProvider: Record<string, ToolPolicyRule>;
};

export type ResolvedToolPolicy = {
	profile: ToolProfile;
	providerRuleKey: string | null;
	allowedTools: Set<string>;
};

const TOOL_NAME_SET = new Set<string>(KNOWN_TOOL_NAMES);

const TOOL_GROUPS: Record<string, readonly ToolName[]> = {
	"group:core": [
		"init",
		"context_query",
		"player_action",
		"simulation_tick",
		"consistency_check",
		"state_get",
		"state_set",
		"world_sync",
	],
	"group:records": [
		"entity_crud",
		"location_crud",
		"faction_crud",
		"event_crud",
	],
	"group:docs": ["markdown_read", "markdown_upsert"],
	"group:sessions": [
		"sessions_list",
		"sessions_history",
		"sessions_send",
		"sessions_spawn",
		"session_status",
	],
	"group:all": KNOWN_TOOL_NAMES,
};

const PROFILE_TOOLS: Record<ToolProfile, readonly ToolName[]> = {
	minimal: [
		"init",
		"context_query",
		"state_get",
		"sessions_list",
		"sessions_history",
		"session_status",
	],
	standard: [
		"init",
		"context_query",
		"player_action",
		"simulation_tick",
		"consistency_check",
		"entity_crud",
		"location_crud",
		"faction_crud",
		"event_crud",
		"state_get",
		"state_set",
		"world_sync",
		"sessions_list",
		"sessions_history",
		"sessions_send",
		"sessions_spawn",
		"session_status",
	],
	full: KNOWN_TOOL_NAMES,
};

function parseProfile(
	value: string | undefined,
	fallback: ToolProfile,
): ToolProfile {
	const normalized = value?.trim().toLowerCase();
	if (
		normalized === "minimal" ||
		normalized === "standard" ||
		normalized === "full"
	) {
		return normalized;
	}
	return fallback;
}

function parseTokenList(value: string | undefined): string[] {
	if (!value) {
		return [];
	}
	return value
		.split(",")
		.map((token) => token.trim())
		.filter((token) => token.length > 0);
}

function parseRuleTokens(value: unknown, fieldName: string): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(
			`Invalid BARDO_TOOLS_BY_PROVIDER_JSON: ${fieldName} must be an array of strings.`,
		);
	}
	const out: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || item.trim().length === 0) {
			throw new Error(
				`Invalid BARDO_TOOLS_BY_PROVIDER_JSON: ${fieldName} entries must be non-empty strings.`,
			);
		}
		out.push(item.trim());
	}
	return out;
}

function expandToken(token: string): readonly string[] {
	const normalized = token.trim();
	if (TOOL_NAME_SET.has(normalized)) {
		return [normalized];
	}

	const groupTools = TOOL_GROUPS[normalized];
	if (groupTools) {
		return [...groupTools];
	}

	throw new Error(`Unknown tool or group token: ${token}`);
}

function expandTokens(tokens: readonly string[]): Set<string> {
	const expanded = new Set<string>();
	for (const token of tokens) {
		const tools = expandToken(token);
		for (const tool of tools) {
			expanded.add(tool);
		}
	}
	return expanded;
}

function parseProviderRules(
	value: string | undefined,
): Record<string, ToolPolicyRule> {
	if (!value || value.trim().length === 0) {
		return {};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(
			"Invalid BARDO_TOOLS_BY_PROVIDER_JSON: expected a valid JSON object.",
		);
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(
			"Invalid BARDO_TOOLS_BY_PROVIDER_JSON: expected an object keyed by provider/model.",
		);
	}

	const out: Record<string, ToolPolicyRule> = {};
	for (const [key, ruleValue] of Object.entries(parsed)) {
		if (
			typeof ruleValue !== "object" ||
			ruleValue === null ||
			Array.isArray(ruleValue)
		) {
			throw new Error(
				`Invalid BARDO_TOOLS_BY_PROVIDER_JSON: rule for ${key} must be an object.`,
			);
		}

		const ruleRecord = ruleValue as Record<string, unknown>;
		const rawProfile =
			typeof ruleRecord.profile === "string"
				? ruleRecord.profile.trim().toLowerCase()
				: undefined;
		let profile: ToolProfile | undefined;
		if (
			rawProfile === "minimal" ||
			rawProfile === "standard" ||
			rawProfile === "full"
		) {
			profile = rawProfile;
		} else if (rawProfile !== undefined) {
			throw new Error(
				`Invalid BARDO_TOOLS_BY_PROVIDER_JSON: profile for ${key} must be minimal, standard, or full.`,
			);
		}
		const allowTokens = parseRuleTokens(ruleRecord.allow, `allow (${key})`);
		const denyTokens = parseRuleTokens(ruleRecord.deny, `deny (${key})`);

		// Validate tokens eagerly to fail fast for bad config.
		expandTokens(allowTokens);
		expandTokens(denyTokens);

		out[key.trim()] = {
			profile,
			allowTokens,
			denyTokens,
		};
	}

	return out;
}

function resolveProfileTools(profile: ToolProfile): Set<string> {
	return new Set<string>(PROFILE_TOOLS[profile]);
}

export function resolveToolPolicyConfig(
	env: Record<string, string | undefined>,
): ToolPolicyConfig {
	const defaultProfile = parseProfile(env.BARDO_TOOLS_PROFILE, "full");
	const baseAllowTokens = parseTokenList(env.BARDO_TOOLS_ALLOW);
	const baseDenyTokens = parseTokenList(env.BARDO_TOOLS_DENY);

	// Validate tokens eagerly to fail fast for bad config.
	expandTokens(baseAllowTokens);
	expandTokens(baseDenyTokens);

	return {
		defaultProfile,
		baseAllowTokens,
		baseDenyTokens,
		byProvider: parseProviderRules(env.BARDO_TOOLS_BY_PROVIDER_JSON),
	};
}

export const TOOL_POLICY_CONFIG = resolveToolPolicyConfig(Bun.env);

function getProviderRuleKeys(args: {
	providerId: string | null;
	modelId: string | null;
	config: ToolPolicyConfig;
}): {
	providerRuleKey: string | null;
	modelRuleKey: string | null;
} {
	const providerId = args.providerId?.trim() ?? "";
	const modelId = args.modelId?.trim() ?? "";

	const providerRuleKey =
		providerId && providerId in args.config.byProvider ? providerId : null;

	let modelRuleKey: string | null = null;
	if (providerId && modelId) {
		const specificKey = `${providerId}/${modelId}`;
		if (specificKey in args.config.byProvider) {
			modelRuleKey = specificKey;
		}
	}

	return {
		providerRuleKey,
		modelRuleKey,
	};
}

export function resolveEffectiveToolPolicy(
	config: ToolPolicyConfig,
	identity: {
		providerId: string | null;
		modelId: string | null;
	},
): ResolvedToolPolicy {
	const keys = getProviderRuleKeys({
		providerId: identity.providerId,
		modelId: identity.modelId,
		config,
	});
	const providerRule = keys.providerRuleKey
		? config.byProvider[keys.providerRuleKey]
		: undefined;
	const modelRule = keys.modelRuleKey
		? config.byProvider[keys.modelRuleKey]
		: undefined;

	const resolvedProfile =
		modelRule?.profile ?? providerRule?.profile ?? config.defaultProfile;
	const allowedTools = resolveProfileTools(resolvedProfile);

	for (const tool of expandTokens(config.baseAllowTokens)) {
		allowedTools.add(tool);
	}
	for (const tool of expandTokens(config.baseDenyTokens)) {
		allowedTools.delete(tool);
	}

	if (providerRule) {
		for (const tool of expandTokens(providerRule.allowTokens)) {
			allowedTools.add(tool);
		}
		for (const tool of expandTokens(providerRule.denyTokens)) {
			allowedTools.delete(tool);
		}
	}

	if (modelRule) {
		for (const tool of expandTokens(modelRule.allowTokens)) {
			allowedTools.add(tool);
		}
		for (const tool of expandTokens(modelRule.denyTokens)) {
			allowedTools.delete(tool);
		}
	}

	return {
		profile: resolvedProfile,
		providerRuleKey: keys.modelRuleKey ?? keys.providerRuleKey,
		allowedTools,
	};
}

export function isToolAllowed(
	resolved: ResolvedToolPolicy,
	toolName: string,
): boolean {
	return resolved.allowedTools.has(toolName);
}

export function findConflictingToolPolicyTokens(
	allowTokens: readonly string[],
	denyTokens: readonly string[],
): string[] {
	const allow = new Set(allowTokens);
	const collisions: string[] = [];
	for (const token of denyTokens) {
		if (allow.has(token)) {
			collisions.push(token);
		}
	}
	return collisions.sort((a, b) => a.localeCompare(b));
}
