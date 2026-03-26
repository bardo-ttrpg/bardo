import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-config";

const PUBLIC_ROUTES = [
	"/",
	"/pricing",
	"/docs",
	"/docs/install",
	"/docs/connect-client",
	"/docs/campaign-truth",
	"/docs/credits-and-billing",
	"/legal",
	"/legal/terms",
	"/legal/privacy",
	"/legal/ai-policy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	const lastModified = new Date("2026-03-19T00:00:00.000Z");

	const staticEntries: MetadataRoute.Sitemap = PUBLIC_ROUTES.map((route) => ({
		url: absoluteUrl(route),
		lastModified,
		changeFrequency: route === "/" ? ("weekly" as const) : ("monthly" as const),
		priority: route === "/" ? 1 : route.startsWith("/docs") ? 0.8 : 0.7,
	}));

	return staticEntries;
}
