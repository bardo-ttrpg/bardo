export const siteConfig = {
	name: "Asset",
	shortName: "Asset",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Asset",
	publisher: "Asset",
	description:
		"The intelligent platform for investing and financial analysis. Build investing workflows, create intelligent agents, and automate financial operations with secure infrastructure.",
	ogDescription:
		"Build investing workflows, research across your financial data sources, and automate modern finance operations with Asset's intelligent platform.",
	keywords: [
		"investing workflows",
		"financial analysis platform",
		"financial agents",
		"investment research automation",
		"finance team software",
		"modern finance infrastructure",
		"investment operations platform",
		"portfolio research tools",
		"secure financial workflows",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
