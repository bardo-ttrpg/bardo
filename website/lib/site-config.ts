export const siteConfig = {
	name: "Bardo",
	shortName: "Bardo",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Bardo",
	publisher: "Bardo",
	description:
		"Bardo is the MCP for playing any tabletop role-playing game. It works with many modern AI clients, keeps your campaign files local, and grounds the model in your real workspace.",
	ogDescription:
		"Bardo works with modern AI clients, keeps campaign files local, and grounds tabletop play in your real workspace for more accurate results.",
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
