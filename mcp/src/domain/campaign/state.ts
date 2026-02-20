import type { CampaignState } from "./types";

export function newStateTemplate(): CampaignState {
	return {
		worldTimeISO: new Date().toISOString(),
		currentLocation: "starting-area",
		counters: {
			unknownNpc: 0,
			unknownLocation: 0,
		},
		locations: {},
		lastAction: "",
	};
}

export function safeParseState(rawBody: string): CampaignState {
	if (!rawBody.trim()) {
		return newStateTemplate();
	}

	try {
		const parsed = JSON.parse(rawBody) as Partial<CampaignState>;
		return {
			worldTimeISO:
				typeof parsed.worldTimeISO === "string"
					? parsed.worldTimeISO
					: new Date().toISOString(),
			currentLocation:
				typeof parsed.currentLocation === "string"
					? parsed.currentLocation
					: "starting-area",
			counters: {
				unknownNpc:
					typeof parsed.counters?.unknownNpc === "number"
						? parsed.counters.unknownNpc
						: 0,
				unknownLocation:
					typeof parsed.counters?.unknownLocation === "number"
						? parsed.counters.unknownLocation
						: 0,
			},
			locations:
				typeof parsed.locations === "object" && parsed.locations !== null
					? (parsed.locations as CampaignState["locations"])
					: {},
			lastAction:
				typeof parsed.lastAction === "string" ? parsed.lastAction : "",
		};
	} catch {
		return newStateTemplate();
	}
}
