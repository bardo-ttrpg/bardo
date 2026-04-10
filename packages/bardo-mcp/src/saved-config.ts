export type SavedConfigV1 = {
	version: 1;
	apiKey: string;
	url: string;
	updatedAtISO: string;
	serverName?: string;
	statusUrl?: string;
};

export type SavedConfigV2 = {
	version: 2;
	accessToken: string;
	refreshToken: string;
	expiresAtISO: string;
	url: string;
	updatedAtISO: string;
	serverName?: string;
	statusUrl?: string;
	refreshUrl?: string;
	accountLabel?: string;
	plan?: "free" | "solo";
};

export type SavedConfig = SavedConfigV1 | SavedConfigV2;

function normalizeLegacyBardoUrl(
	value: string | undefined,
): string | undefined {
	if (typeof value !== "string" || value.length === 0) {
		return undefined;
	}

	try {
		const url = new URL(value);
		if (url.hostname === "app.bardo.ai") {
			url.hostname = "www.bardo.gg";
			return url.toString();
		}
		return value;
	} catch {
		return value;
	}
}

export function migrateSavedConfig(raw: unknown): SavedConfig | null {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return null;
	}

	const parsed = raw as Record<string, unknown>;

	if (parsed.version === 2) {
		if (
			typeof parsed.accessToken !== "string" ||
			typeof parsed.refreshToken !== "string" ||
			typeof parsed.expiresAtISO !== "string" ||
			typeof parsed.url !== "string"
		) {
			return null;
		}

		return {
			version: 2,
			accessToken: parsed.accessToken,
			refreshToken: parsed.refreshToken,
			expiresAtISO: parsed.expiresAtISO,
			url: parsed.url,
			updatedAtISO:
				typeof parsed.updatedAtISO === "string"
					? parsed.updatedAtISO
					: new Date(0).toISOString(),
			serverName:
				typeof parsed.serverName === "string" ? parsed.serverName : undefined,
			statusUrl: normalizeLegacyBardoUrl(
				typeof parsed.statusUrl === "string" ? parsed.statusUrl : undefined,
			),
			refreshUrl: normalizeLegacyBardoUrl(
				typeof parsed.refreshUrl === "string" ? parsed.refreshUrl : undefined,
			),
			accountLabel:
				typeof parsed.accountLabel === "string"
					? parsed.accountLabel
					: undefined,
			plan:
				parsed.plan === "free"
					? "free"
					: parsed.plan === "solo" || parsed.plan === "solo_plus"
						? "solo"
						: undefined,
		};
	}

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
		statusUrl: normalizeLegacyBardoUrl(
			typeof parsed.statusUrl === "string" ? parsed.statusUrl : undefined,
		),
	};
}
