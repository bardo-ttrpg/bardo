import {
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import { parseMarkdown } from "../markdown/markdown";

type TableContract = {
	tone: string;
	boundaries: {
		lines: string[];
		veils: string[];
	};
	pvp: string;
	retconPolicy: string;
};

type AuthorityPolicy = {
	mode: string;
	factIntroduction: string;
	ruleAdjudication: string;
	safetyVeto: string;
	allowRuleBypass: boolean;
	allowUnilateralRetcon: boolean;
	allowPlayerCanonDeclarations: boolean;
};

type RuntimePolicyViolationCode =
	| "CONTENT_BOUNDARY_LINE"
	| "RULE_BYPASS_DISALLOWED"
	| "UNILATERAL_RETCON_DISALLOWED"
	| "CANON_DECLARATION_DISALLOWED";

type RuntimePolicyViolation = {
	code: RuntimePolicyViolationCode;
	message: string;
	match: string;
};

const DEFAULT_TABLE_CONTRACT: TableContract = {
	tone: "heroic-fantasy",
	boundaries: {
		lines: ["sexual violence"],
		veils: ["graphic gore"],
	},
	pvp: "requires-consent",
	retconPolicy: "table-consensus",
};

const DEFAULT_AUTHORITY_POLICY: AuthorityPolicy = {
	mode: "traditional-gm",
	factIntroduction: "gm_with_player_input",
	ruleAdjudication: "gm_with_override_logging",
	safetyVeto: "any_participant",
	allowRuleBypass: false,
	allowUnilateralRetcon: false,
	allowPlayerCanonDeclarations: false,
};

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	const normalized: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") {
			continue;
		}
		const trimmed = item.trim();
		if (trimmed.length > 0) {
			normalized.push(trimmed);
		}
	}
	return normalized;
}

function parseJsonManifest<T>(raw: string | null, fallback: T): T {
	if (!raw || raw.trim().length === 0) {
		return fallback;
	}
	const parsedMarkdown = parseMarkdown(raw);
	const candidate = parsedMarkdown.content.trim() || raw.trim();
	try {
		return {
			...fallback,
			...(JSON.parse(candidate) as Record<string, unknown>),
		} as T;
	} catch {
		return fallback;
	}
}

export async function loadTableContract(args: {
	bardoRoot: string;
}): Promise<TableContract> {
	const contractPath = resolvePathInsideRoot(
		args.bardoRoot,
		"manifests/table-contract.json",
	);
	const raw = await readTextIfExists(contractPath);
	const merged = parseJsonManifest(raw, DEFAULT_TABLE_CONTRACT);
	const lines = normalizeStringArray(merged.boundaries?.lines);
	const veils = normalizeStringArray(merged.boundaries?.veils);
	return {
		tone:
			typeof merged.tone === "string"
				? merged.tone
				: DEFAULT_TABLE_CONTRACT.tone,
		boundaries: {
			lines,
			veils,
		},
		pvp:
			typeof merged.pvp === "string" ? merged.pvp : DEFAULT_TABLE_CONTRACT.pvp,
		retconPolicy:
			typeof merged.retconPolicy === "string"
				? merged.retconPolicy
				: DEFAULT_TABLE_CONTRACT.retconPolicy,
	};
}

export async function loadAuthorityPolicy(args: {
	bardoRoot: string;
}): Promise<AuthorityPolicy> {
	const policyPath = resolvePathInsideRoot(
		args.bardoRoot,
		"manifests/authority-policy.json",
	);
	const raw = await readTextIfExists(policyPath);
	const merged = parseJsonManifest(raw, DEFAULT_AUTHORITY_POLICY);
	return {
		mode:
			typeof merged.mode === "string"
				? merged.mode
				: DEFAULT_AUTHORITY_POLICY.mode,
		factIntroduction:
			typeof merged.factIntroduction === "string"
				? merged.factIntroduction
				: DEFAULT_AUTHORITY_POLICY.factIntroduction,
		ruleAdjudication:
			typeof merged.ruleAdjudication === "string"
				? merged.ruleAdjudication
				: DEFAULT_AUTHORITY_POLICY.ruleAdjudication,
		safetyVeto:
			typeof merged.safetyVeto === "string"
				? merged.safetyVeto
				: DEFAULT_AUTHORITY_POLICY.safetyVeto,
		allowRuleBypass:
			typeof merged.allowRuleBypass === "boolean"
				? merged.allowRuleBypass
				: DEFAULT_AUTHORITY_POLICY.allowRuleBypass,
		allowUnilateralRetcon:
			typeof merged.allowUnilateralRetcon === "boolean"
				? merged.allowUnilateralRetcon
				: DEFAULT_AUTHORITY_POLICY.allowUnilateralRetcon,
		allowPlayerCanonDeclarations:
			typeof merged.allowPlayerCanonDeclarations === "boolean"
				? merged.allowPlayerCanonDeclarations
				: DEFAULT_AUTHORITY_POLICY.allowPlayerCanonDeclarations,
	};
}

const RULE_BYPASS_PATTERN =
	/\b(ignore\s+(the\s+)?rules?|without\s+rolling|no\s+roll|automatic\s+success|auto\s+succeed|rules\s+don'?t\s+matter)\b/i;
const RETCON_PATTERN = /\b(retcon|rewrite\s+history|was\s+always\s+true)\b/i;
const CANON_DECLARATION_PATTERN =
	/\b(i\s+declare|this\s+is\s+canon|canonically|i\s+decide\s+the\s+world)\b/i;

export function evaluateRuntimePolicy(args: {
	action: string;
	tableContract: TableContract;
	authorityPolicy: AuthorityPolicy;
}): RuntimePolicyViolation[] {
	const actionNormalized = args.action.toLowerCase();
	const violations: RuntimePolicyViolation[] = [];

	for (const line of args.tableContract.boundaries.lines) {
		const normalized = line.toLowerCase();
		if (normalized.length > 0 && actionNormalized.includes(normalized)) {
			violations.push({
				code: "CONTENT_BOUNDARY_LINE",
				message: `Action violates table boundary line: ${line}`,
				match: line,
			});
		}
	}

	if (!args.authorityPolicy.allowRuleBypass) {
		const match = RULE_BYPASS_PATTERN.exec(args.action);
		if (match?.[0]) {
			violations.push({
				code: "RULE_BYPASS_DISALLOWED",
				message:
					"Action requests rule bypass but authority policy disallows it.",
				match: match[0],
			});
		}
	}

	if (!args.authorityPolicy.allowUnilateralRetcon) {
		const match = RETCON_PATTERN.exec(args.action);
		if (match?.[0]) {
			violations.push({
				code: "UNILATERAL_RETCON_DISALLOWED",
				message: "Action requests unilateral retcon but policy disallows it.",
				match: match[0],
			});
		}
	}

	if (!args.authorityPolicy.allowPlayerCanonDeclarations) {
		const match = CANON_DECLARATION_PATTERN.exec(args.action);
		if (match?.[0]) {
			violations.push({
				code: "CANON_DECLARATION_DISALLOWED",
				message:
					"Action attempts unilateral canon declaration but policy disallows it.",
				match: match[0],
			});
		}
	}

	return violations;
}

export function summarizeRuntimePolicyViolations(
	violations: readonly RuntimePolicyViolation[],
): string {
	if (violations.length === 0) {
		return "No runtime policy violations.";
	}
	if (violations.length === 1) {
		return violations[0]?.message ?? "Runtime policy blocked action.";
	}
	return `Runtime policy blocked action for ${String(violations.length)} reasons: ${violations
		.map((violation) => violation.code)
		.join(", ")}.`;
}
