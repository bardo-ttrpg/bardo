export const siteConfig = {
	name: "Bardo",
	shortName: "Bardo",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Bardo",
	publisher: "Bardo",
	description:
		"Play solo tabletop role-playing games with an AI-guided game master replacement that keeps your campaign files local.",
	ogDescription:
		"Bardo connects your AI client to local campaign files so you can play solo tabletop RPGs without a human GM at the table.",
	keywords: [
		"bardo",
		"solo tabletop RPG",
		"solo tabletop role-playing game",
		"solo RPG with AI",
		"AI dungeon master",
		"AI tabletop RPG assistant",
		"GM-less RPG",
		"tabletop RPG MCP",
		"local campaign files",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
