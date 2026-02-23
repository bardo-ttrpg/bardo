import {
	readTextIfExists,
	resolvePathInsideRoot,
} from "../../infra/filesystem/filesystem";
import { recordLegacyFallbackReadMetric } from "../../telemetry";
import { safeParseState } from "../campaign/state";
import type { CampaignState } from "../campaign/types";
import { resolveFeatureFlags } from "../config/features";
import { readCanonicalEvents } from "../events/store";
import { parseMarkdown } from "../markdown/markdown";
import { regenerateCurrentStateProjection } from "./current-state";

export type PreferredStateSource =
	| "projection"
	| "legacy_state"
	| "empty_default";

type ParsedStateFile = {
	path: string;
	exists: boolean;
	frontmatter: Record<string, string>;
	rawContent: string;
	state: CampaignState;
};

async function readStateFile(filePath: string): Promise<ParsedStateFile> {
	const raw = await readTextIfExists(filePath);
	if (raw === null) {
		return {
			path: filePath,
			exists: false,
			frontmatter: {},
			rawContent: "",
			state: safeParseState(""),
		};
	}

	const parsed = parseMarkdown(raw);
	return {
		path: filePath,
		exists: true,
		frontmatter: parsed.frontmatter,
		rawContent: parsed.content,
		state: safeParseState(parsed.content),
	};
}

function parsePositiveInteger(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return parsed;
}

export async function loadPreferredCurrentState(args: {
	bardoRoot: string;
	consumer?: string;
	strictCanonicalMode?: boolean;
	allowLegacyFallbackInStrict?: boolean;
	refreshStaleProjection?: boolean;
}): Promise<{
	source: PreferredStateSource;
	chosen: ParsedStateFile;
	projection: ParsedStateFile;
	legacyState: ParsedStateFile;
}> {
	const strictCanonicalMode =
		typeof args.strictCanonicalMode === "boolean"
			? args.strictCanonicalMode
			: resolveFeatureFlags(Bun.env).strictCanonicalMode;
	const projectionPath = resolvePathInsideRoot(
		args.bardoRoot,
		"projections/current-state.md",
	);
	const legacyStatePath = resolvePathInsideRoot(
		args.bardoRoot,
		"state/current.md",
	);
	let projection = await readStateFile(projectionPath);
	const legacyState = await readStateFile(legacyStatePath);

	if (projection.exists) {
		if (strictCanonicalMode || args.refreshStaleProjection) {
			const events = await readCanonicalEvents({ bardoRoot: args.bardoRoot });
			const latestSequence = events.at(-1)?.sequence ?? 0;
			const projectionSeqMax = parsePositiveInteger(
				projection.frontmatter.source_event_seq_max,
			);
			const isStale =
				projectionSeqMax === null || latestSequence > projectionSeqMax;
			if (isStale) {
				if (strictCanonicalMode) {
					throw new Error(
						`STRICT_CANONICAL_STALE_PROJECTION: projection sequence ${String(
							projectionSeqMax ?? -1,
						)} is behind canonical sequence ${String(latestSequence)}.`,
					);
				}
				if (args.refreshStaleProjection) {
					await regenerateCurrentStateProjection({
						bardoRoot: args.bardoRoot,
					});
					projection = await readStateFile(projectionPath);
				}
			}
		}
		return {
			source: "projection",
			chosen: projection,
			projection,
			legacyState,
		};
	}

	if (legacyState.exists) {
		if (strictCanonicalMode && !args.allowLegacyFallbackInStrict) {
			if (args.consumer) {
				recordLegacyFallbackReadMetric({
					consumer: args.consumer,
					strictMode: true,
					outcome: "blocked",
				});
			}
			throw new Error(
				"STRICT_CANONICAL_LEGACY_FALLBACK_BLOCKED: projections/current-state.md is required in strict canonical mode.",
			);
		}
		if (args.consumer) {
			recordLegacyFallbackReadMetric({
				consumer: args.consumer,
				strictMode: strictCanonicalMode,
				outcome: "used",
			});
		}
		return {
			source: "legacy_state",
			chosen: legacyState,
			projection,
			legacyState,
		};
	}

	return {
		source: "empty_default",
		chosen: projection,
		projection,
		legacyState,
	};
}
