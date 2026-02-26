import {
	readTextIfExists,
	resolvePathInsideRoot,
	writeTextAtomic,
} from "../../infra/filesystem/filesystem";

const SCHEMA_VERSION_MANIFEST_PATH = "manifests/schema-version.json";

type SchemaVersionManifest = {
	eventSchema: string;
	projectionSchema: string;
	migrations: Array<{
		id: string;
		atISO: string;
		notes: string;
	}>;
	updatedAtISO: string;
};

function defaultManifest(nowIso: string): SchemaVersionManifest {
	return {
		eventSchema: "v1",
		projectionSchema: "v1",
		migrations: [],
		updatedAtISO: nowIso,
	};
}

function parseManifest(
	raw: string | null,
	nowIso: string,
): SchemaVersionManifest {
	if (!raw || raw.trim().length === 0) {
		return defaultManifest(nowIso);
	}
	try {
		const parsed = JSON.parse(raw) as Partial<SchemaVersionManifest>;
		return {
			eventSchema:
				typeof parsed.eventSchema === "string" ? parsed.eventSchema : "v1",
			projectionSchema:
				typeof parsed.projectionSchema === "string"
					? parsed.projectionSchema
					: "v1",
			migrations: Array.isArray(parsed.migrations)
				? parsed.migrations
						.filter(
							(entry) =>
								typeof entry === "object" &&
								entry !== null &&
								typeof (entry as { id?: unknown }).id === "string" &&
								typeof (entry as { atISO?: unknown }).atISO === "string" &&
								typeof (entry as { notes?: unknown }).notes === "string",
						)
						.map((entry) => ({
							id: (entry as { id: string }).id,
							atISO: (entry as { atISO: string }).atISO,
							notes: (entry as { notes: string }).notes,
						}))
				: [],
			updatedAtISO:
				typeof parsed.updatedAtISO === "string" ? parsed.updatedAtISO : nowIso,
		};
	} catch {
		return defaultManifest(nowIso);
	}
}

export async function appendSchemaMigrationRecord(args: {
	bardoRoot: string;
	migrationId: string;
	notes: string;
	nowIso: string;
}): Promise<{ manifestPath: string; manifest: SchemaVersionManifest }> {
	const manifestPath = resolvePathInsideRoot(
		args.bardoRoot,
		SCHEMA_VERSION_MANIFEST_PATH,
	);
	const existingRaw = await readTextIfExists(manifestPath);
	const manifest = parseManifest(existingRaw, args.nowIso);

	const alreadyRecorded = manifest.migrations.some(
		(migration) => migration.id === args.migrationId,
	);
	if (!alreadyRecorded) {
		manifest.migrations.push({
			id: args.migrationId,
			atISO: args.nowIso,
			notes: args.notes,
		});
	}
	manifest.updatedAtISO = args.nowIso;

	await writeTextAtomic(manifestPath, JSON.stringify(manifest, null, 2));

	return {
		manifestPath,
		manifest,
	};
}
