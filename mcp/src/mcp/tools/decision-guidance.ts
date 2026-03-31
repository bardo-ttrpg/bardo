import * as z from "zod/v4";

const evidenceSourceSchema = z.enum(["canonical", "user-provided", "inferred"]);

const evidenceConfidenceSchema = z.enum(["high", "medium", "low"]);

const groundingStatusSchema = z.enum([
	"grounded_enough",
	"partially_grounded",
	"underspecified",
]);

const inferencePolicySchema = z.enum([
	"must_ask",
	"safe_inference",
	"structured_possibilities",
]);

const guidanceFactSchema = z.object({
	summary: z.string(),
	source: evidenceSourceSchema,
	confidence: evidenceConfidenceSchema,
	citation: z.string().optional(),
});

const recommendedNextStepSchema = z.object({
	action: z.string(),
	reason: z.string(),
	tool: z.string().optional(),
});

const riskFlagSchema = z.object({
	severity: z.enum(["low", "medium", "high"]),
	flag: z.string(),
	reason: z.string(),
});

const writeTargetSchema = z.object({
	path: z.string(),
	operation: z.enum(["read", "refresh", "append", "update", "review"]),
	reason: z.string(),
});

const writePlanSchema = z.object({
	status: z.enum(["none", "recommended_only", "already_applied"]),
	shouldWrite: z.boolean(),
	summary: z.string(),
	targets: z.array(writeTargetSchema),
});

const verificationCheckSchema = z.object({
	name: z.string(),
	status: z.enum(["passed", "warning", "failed"]),
	reason: z.string(),
});

const provenanceEntrySchema = z.object({
	source: evidenceSourceSchema,
	detail: z.string(),
	confidence: evidenceConfidenceSchema,
	citation: z.string().optional(),
});

export const decisionGuidanceSchema = z.object({
	factsFound: z.array(guidanceFactSchema),
	constraints: z.array(z.string()),
	unknowns: z.array(z.string()),
	confidence: z.object({
		overall: evidenceConfidenceSchema,
		grounding: groundingStatusSchema,
	}),
	mustAskUser: z.boolean(),
	inferencePolicy: inferencePolicySchema,
	commitRecommended: z.boolean(),
	recommendedFollowUpTools: z.array(z.string()),
	recommendedReadTargets: z.array(z.string()),
	verificationChecks: z.array(verificationCheckSchema),
	recommendedNextSteps: z.array(recommendedNextStepSchema),
	riskFlags: z.array(riskFlagSchema),
	writePlan: writePlanSchema,
	provenance: z.array(provenanceEntrySchema),
});

type EvidenceConfidence = z.infer<typeof evidenceConfidenceSchema>;

export function inferWorkspaceEvidenceSource(
	relativePath: string,
): z.infer<typeof evidenceSourceSchema> {
	const normalized = relativePath.replaceAll("\\", "/");
	if (normalized.startsWith("projections/") || normalized.startsWith("logs/")) {
		return "inferred";
	}
	if (
		normalized.startsWith("events/") ||
		normalized.startsWith("state/") ||
		normalized.startsWith("world/") ||
		normalized.startsWith("entities/") ||
		normalized.startsWith("quests/") ||
		normalized.startsWith("docs/")
	) {
		return "canonical";
	}
	return "canonical";
}

export function extractMarkdownSectionBullets(
	rawMarkdown: string,
	heading: string,
): string[] {
	const lines = rawMarkdown.split(/\r?\n/);
	const targetHeading = `## ${heading}`.trim();
	const bullets: string[] = [];
	let inTarget = false;

	for (const line of lines) {
		if (line.trim() === targetHeading) {
			inTarget = true;
			continue;
		}

		if (inTarget && line.startsWith("## ")) {
			break;
		}

		if (!inTarget) {
			continue;
		}

		const trimmed = line.trim();
		if (trimmed.startsWith("- ")) {
			bullets.push(trimmed.slice(2).trim());
		}
	}

	return bullets;
}

export function inferUnknownsFromText(lines: readonly string[]): string[] {
	return lines.filter((line) =>
		/\b(no|none|not|unknown|unclear|unresolved|missing|insufficient)\b/i.test(
			line,
		),
	);
}

export function pickOverallConfidence(args: {
	highSignals: number;
	mediumSignals?: number;
	lowSignals?: number;
}): EvidenceConfidence {
	const mediumSignals = args.mediumSignals ?? 0;
	const lowSignals = args.lowSignals ?? 0;
	if (lowSignals > args.highSignals + mediumSignals) {
		return "low";
	}
	if (args.highSignals >= Math.max(2, lowSignals)) {
		return "high";
	}
	return "medium";
}
