export const siteConfig = {
	name: "Bardo",
	shortName: "Bardo",
	url: "https://www.bardo.gg",
	locale: "en_US",
	creator: "Bardo",
	publisher: "Bardo",
	description:
		"A small, focused website for Bardo docs, notes, auth, and dashboard access.",
	ogDescription:
		"Bardo keeps the website surface minimal: docs, blog, account access, and a protected dashboard for bridge approvals.",
	keywords: [
		"bardo",
		"mcp dashboard",
		"ai workspace bridge",
		"docs",
		"blog",
		"clerk auth",
	],
} as const;

export function absoluteUrl(path = "/"): string {
	return new URL(path, siteConfig.url).toString();
}
