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
		"tabletop role-playing game MCP",
		"tabletop RPG MCP",
		"TTRPG MCP server",
		"AI tabletop RPG assistant",
		"AI role-playing game assistant",
		"AI RPG client",
		"local campaign files",
		"grounded AI tabletop play",
		"solo tabletop RPG",
		"solo tabletop role-playing game",
		"solo RPG with AI",
		"AI dungeon master",
		"AI game master",
		"GM-less RPG",
		"local-first tabletop RPG",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
