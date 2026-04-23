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
		"Play solo tabletop role-playing games with a local-first AI game master that keeps campaign files on your machine and grounded in your world.",
	socialDescription:
		"Bardo connects your AI client to local campaign files so you can play solo tabletop RPGs with a grounded AI game master and no human GM at the table.",
	keywords: landingPageKeywords,
} as const;

export const pricingSeo = {
	title: "Pricing",
	description:
		"Choose monthly or yearly Bardo Solo billing for a local-first tabletop RPG MCP with grounded world state, hosted account access, and bridge approvals.",
	socialDescription:
		"See monthly and yearly Bardo Solo pricing for a local-first tabletop RPG MCP that keeps campaign truth on your machine.",
	keywords: [
		...landingPageKeywords,
		"Bardo pricing",
		"TTRPG MCP pricing",
		"AI game master pricing",
	],
} as const;

export function getLandingPageJsonLd() {
	return [
		{
			"@context": "https://schema.org",
			"@type": "Organization",
			name: siteConfig.publisher,
			url: siteConfig.url,
		},
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

export function getPricingPageJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: `${siteConfig.name} Solo`,
		url: absoluteUrl("/pricing"),
		description: pricingSeo.description,
		applicationCategory: "GameApplication",
		operatingSystem: "Web, macOS, Windows, Linux",
		offers: [
			{
				"@type": "Offer",
				priceCurrency: "USD",
				price: "20",
				name: "Bardo Solo Monthly",
				category: "Monthly subscription",
				url: absoluteUrl("/pricing"),
			},
			{
				"@type": "Offer",
				priceCurrency: "USD",
				price: "192",
				name: "Bardo Solo Yearly",
				category: "Yearly subscription",
				url: absoluteUrl("/pricing"),
			},
		],
	} as const;
}

export function getDocsBreadcrumbJsonLd(entry: {
	title: string;
	href: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: siteConfig.name,
				item: siteConfig.url,
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "Docs",
				item: absoluteUrl("/docs"),
			},
			{
				"@type": "ListItem",
				position: 3,
				name: entry.title,
				item: absoluteUrl(entry.href),
			},
		],
	} as const;
}

export function getLegalBreadcrumbJsonLd(entry: {
	title: string;
	href: string;
}) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				name: siteConfig.name,
				item: siteConfig.url,
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "Legal",
				item: absoluteUrl("/legal/terms"),
			},
			{
				"@type": "ListItem",
				position: 3,
				name: entry.title,
				item: absoluteUrl(entry.href),
			},
		],
	} as const;
}
