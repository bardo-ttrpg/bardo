export type CampaignState = {
	worldTimeISO: string;
	currentLocation: string;
	counters: {
		unknownNpc: number;
		unknownLocation: number;
	};
	locations: Record<
		string,
		{
			name: string;
			visits: number;
			npcIds: string[];
		}
	>;
	lastAction: string;
};

export type OptionalSystems = {
	npcs: boolean;
	quests: boolean;
	items: boolean;
	worldGeneration: boolean;
};
