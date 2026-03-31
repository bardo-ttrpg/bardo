import type { MetadataRoute } from "next";
import { listBlogEntries, listDocsEntries } from "@/content/site-content";
import { absoluteUrl } from "@/lib/site-config";

const STATIC_ROUTES = [
	"/",
	"/blog",
	"/legal",
	"/legal/terms",
	"/legal/privacy",
	"/legal/ai-policy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	const contentRoutes = [
		...listDocsEntries().map((entry) => ({
			route: entry.href,
			lastModified: new Date(entry.lastModified),
		})),
		...listBlogEntries().map((entry) => ({
			route: entry.href,
			lastModified: new Date(entry.publishedAt),
		})),
	];

	return [
		...STATIC_ROUTES.map((route) => ({
			url: absoluteUrl(route),
			lastModified: new Date("2026-03-29T00:00:00.000Z"),
			changeFrequency:
				route === "/" ? ("weekly" as const) : ("monthly" as const),
			priority: route === "/" ? 1 : 0.7,
		})),
		...contentRoutes.map((entry) => ({
			url: absoluteUrl(entry.route),
			lastModified: entry.lastModified,
			changeFrequency:
				entry.route === "/docs" ? ("weekly" as const) : ("monthly" as const),
			priority: entry.route === "/docs" ? 0.8 : 0.7,
		})),
	];
}
