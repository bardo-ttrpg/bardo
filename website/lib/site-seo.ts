import { absoluteUrl, siteConfig } from "./site-config";

export const landingPageKeywords = [
	"solo tabletop RPG",
	"solo tabletop role-playing game",
	"solo RPG with AI",
	"AI dungeon master",
	"AI tabletop RPG assistant",
	"GM-less RPG",
	"tabletop RPG MCP",
	"local campaign files",
] as const;

export const homeSeo = {
	title: siteConfig.name,
	description:
		"Play solo tabletop role-playing games with an AI-guided game master replacement that keeps your campaign files local and grounded in your world.",
	socialDescription:
		"Bardo connects your AI client to local campaign files so you can play solo tabletop RPGs with a grounded AI game master and no human GM at the table.",
	keywords: landingPageKeywords,
} as const;

export function getLandingPageJsonLd() {
	return [
		{
			"@context": "https://schema.org",
			"@type": "WebSite",
			name: siteConfig.name,
			url: siteConfig.url,
			description: homeSeo.description,
			inLanguage: "en-US",
			publisher: {
				"@type": "Organization",
				name: siteConfig.publisher,
				url: siteConfig.url,
			},
		},
		{
			"@context": "https://schema.org",
			"@type": "SoftwareApplication",
			name: siteConfig.name,
			url: siteConfig.url,
			description: homeSeo.description,
			applicationCategory: "GameApplication",
			operatingSystem: "Web, macOS, Windows, Linux",
			featureList: [
				"Solo tabletop RPG play with AI assistance",
				"Local campaign files stay on your machine",
				"Grounded tabletop context through the Bardo MCP",
				"Hosted bridge approvals and account management",
			],
			image: absoluteUrl("/opengraph-image"),
		},
	] as const;
}
