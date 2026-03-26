export const siteConfig = {
	name: "Bardo",
	shortName: "Bardo",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Bardo",
	publisher: "Bardo",
	description:
		"Bardo is a system-agnostic paid remote MCP for tabletop campaigns, with a local workspace bridge and canon-aware AI GM tools for MCP-capable AI clients.",
	ogDescription:
		"Connect an AI client through the local bridge, keep your campaign workspace local, and use the full paid remote Bardo toolset with Clerk-based access control.",
	keywords: [
		"AI game master",
		"remote MCP server",
		"system agnostic AI GM",
		"tabletop RPG campaign continuity",
		"Clerk billing",
		"local workspace bridge",
		"MCP tabletop RPG",
		"TTRPG world state tracker",
		"campaign truth markdown",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
