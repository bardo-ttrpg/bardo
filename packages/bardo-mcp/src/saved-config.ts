export type SavedConfig = {
	version: 1;
	apiKey: string;
	url: string;
	updatedAtISO: string;
	serverName?: string;
	statusUrl?: string;
};

type LegacySavedConfig = Omit<SavedConfig, "version">;

export function migrateSavedConfig(raw: unknown): SavedConfig | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return null;
	}

	const parsed = raw as Partial<SavedConfig & LegacySavedConfig>;
	if (parsed.version !== undefined && parsed.version !== 1) {
		return null;
	}
	if (typeof parsed.apiKey !== "string" || typeof parsed.url !== "string") {
		return null;
	}

	return {
		version: 1,
		apiKey: parsed.apiKey,
		url: parsed.url,
		updatedAtISO:
			typeof parsed.updatedAtISO === "string"
				? parsed.updatedAtISO
				: new Date(0).toISOString(),
		serverName:
			typeof parsed.serverName === "string" ? parsed.serverName : undefined,
		statusUrl:
			typeof parsed.statusUrl === "string" ? parsed.statusUrl : undefined,
	};
}
