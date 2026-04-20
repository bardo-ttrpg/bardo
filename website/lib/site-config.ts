export const siteConfig = {
	name: "Bardo",
	shortName: "Bardo",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Bardo",
	publisher: "Bardo",
	description:
		"Play solo tabletop role-playing games with a local-first AI game master that keeps campaign files on your machine and grounds play in your real world state.",
	ogDescription:
		"Bardo connects your AI client to local campaign files so you can play solo tabletop RPGs with a grounded AI game master and local-first campaign truth.",
	keywords: [
		"bardo",
		"solo tabletop RPG",
		"solo tabletop role-playing game",
		"solo RPG with AI",
		"AI dungeon master",
		"AI game master",
		"AI tabletop RPG assistant",
		"GM-less RPG",
		"local-first tabletop RPG",
		"TTRPG MCP server",
		"tabletop RPG MCP",
		"local campaign files",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
