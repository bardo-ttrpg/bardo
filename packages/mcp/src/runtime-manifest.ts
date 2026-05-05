type RuntimeArtifactManifest = {
	conflictsPath: string;
	diagnosticsPath: string;
	turnTracePath: string;
	snapshotsDirectory: string;
	snapshotIndexPath: string;
};

type CampaignBootstrapManifest = {
	sourceIndexPath: string;
	entitiesPath: string;
	currentStatePath: string;
	trackingProfilePath: string;
	readinessPath: string;
	readiness: {
		status: "ready" | "ready-with-gaps" | "needs-user-input";
		gaps: string[];
	};
};

function normalizeReadinessStatus(
	value: unknown,
): "ready" | "ready-with-gaps" | "needs-user-input" {
	return value === "ready" ||
		value === "ready-with-gaps" ||
		value === "needs-user-input"
		? value
		: "needs-user-input";
}

type RuntimeManifest = {
	version: 1;
	createdAtISO: string | null;
	updatedAtISO: string | null;
	workspaceRoot: string | null;
	bardoRoot: string | null;
	ruleset: string | null;
	importedRulebooks: string[];
	rulebookHashes?: Record<string, string>;
	rulebookBootstrap?: Record<string, unknown> | null;
	campaignBootstrap?: CampaignBootstrapManifest;
	runtimeArtifacts: RuntimeArtifactManifest;
	capabilityManifest?: string[];
	supplements?: unknown[];
};

export function normalizeRuntimeManifest(raw: unknown): RuntimeManifest | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const runtimeArtifacts =
		typeof record.runtimeArtifacts === "object" &&
		record.runtimeArtifacts !== null &&
		!Array.isArray(record.runtimeArtifacts)
			? (record.runtimeArtifacts as Record<string, unknown>)
			: {};
	const campaignBootstrap =
		typeof record.campaignBootstrap === "object" &&
		record.campaignBootstrap !== null &&
		!Array.isArray(record.campaignBootstrap)
			? (record.campaignBootstrap as Record<string, unknown>)
			: null;

	return {
		version: 1,
		createdAtISO:
			typeof record.createdAtISO === "string" ? record.createdAtISO : null,
		updatedAtISO:
			typeof record.updatedAtISO === "string" ? record.updatedAtISO : null,
		workspaceRoot:
			typeof record.workspaceRoot === "string" ? record.workspaceRoot : null,
		bardoRoot: typeof record.bardoRoot === "string" ? record.bardoRoot : null,
		ruleset: typeof record.ruleset === "string" ? record.ruleset : null,
		importedRulebooks: Array.isArray(record.importedRulebooks)
			? record.importedRulebooks.filter(
					(entry): entry is string => typeof entry === "string",
				)
			: [],
		rulebookHashes:
			typeof record.rulebookHashes === "object" &&
			record.rulebookHashes !== null &&
			!Array.isArray(record.rulebookHashes)
				? Object.fromEntries(
						Object.entries(record.rulebookHashes).filter(
							([, entry]) => typeof entry === "string",
						),
					)
				: undefined,
		rulebookBootstrap:
			typeof record.rulebookBootstrap === "object" &&
			record.rulebookBootstrap !== null &&
			!Array.isArray(record.rulebookBootstrap)
				? (record.rulebookBootstrap as Record<string, unknown>)
				: null,
		campaignBootstrap: campaignBootstrap
			? {
					sourceIndexPath:
						typeof campaignBootstrap.sourceIndexPath === "string"
							? campaignBootstrap.sourceIndexPath
							: "manifests/source-index.json",
					entitiesPath:
						typeof campaignBootstrap.entitiesPath === "string"
							? campaignBootstrap.entitiesPath
							: "entities/campaign-entities.json",
					currentStatePath:
						typeof campaignBootstrap.currentStatePath === "string"
							? campaignBootstrap.currentStatePath
							: "state/current-state.json",
					trackingProfilePath:
						typeof campaignBootstrap.trackingProfilePath === "string"
							? campaignBootstrap.trackingProfilePath
							: "simulation/tracking-profile.json",
					readinessPath:
						typeof campaignBootstrap.readinessPath === "string"
							? campaignBootstrap.readinessPath
							: "manifests/readiness.json",
					readiness: {
						status: normalizeReadinessStatus(
							campaignBootstrap.readiness &&
								typeof campaignBootstrap.readiness === "object" &&
								!Array.isArray(campaignBootstrap.readiness)
								? (campaignBootstrap.readiness as Record<string, unknown>)
										.status
								: undefined,
						),
						gaps:
							campaignBootstrap.readiness &&
							typeof campaignBootstrap.readiness === "object" &&
							!Array.isArray(campaignBootstrap.readiness) &&
							Array.isArray(
								(campaignBootstrap.readiness as Record<string, unknown>).gaps,
							)
								? (
										(campaignBootstrap.readiness as Record<string, unknown>)
											.gaps as unknown[]
									).filter(
										(entry): entry is string => typeof entry === "string",
									)
								: [],
					},
				}
			: undefined,
		runtimeArtifacts: {
			conflictsPath:
				typeof runtimeArtifacts.conflictsPath === "string"
					? runtimeArtifacts.conflictsPath
					: "manifests/conflicts.json",
			diagnosticsPath:
				typeof runtimeArtifacts.diagnosticsPath === "string"
					? runtimeArtifacts.diagnosticsPath
					: "manifests/diagnostics.json",
			turnTracePath:
				typeof runtimeArtifacts.turnTracePath === "string"
					? runtimeArtifacts.turnTracePath
					: "logs/turn-trace.ndjson",
			snapshotsDirectory:
				typeof runtimeArtifacts.snapshotsDirectory === "string"
					? runtimeArtifacts.snapshotsDirectory
					: "snapshots",
			snapshotIndexPath:
				typeof runtimeArtifacts.snapshotIndexPath === "string"
					? runtimeArtifacts.snapshotIndexPath
					: "snapshots/index.json",
		},
		capabilityManifest: Array.isArray(record.capabilityManifest)
			? record.capabilityManifest.filter(
					(entry): entry is string => typeof entry === "string",
				)
			: undefined,
		supplements: Array.isArray(record.supplements)
			? record.supplements
			: undefined,
	};
}
