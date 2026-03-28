import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-config";

const PUBLIC_ROUTES = ["/", "/contact", "/privacy-policy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
	const lastModified = new Date("2026-03-27T00:00:00.000Z");

	return PUBLIC_ROUTES.map((route) => ({
		url: absoluteUrl(route),
		lastModified,
		changeFrequency: route === "/" ? ("weekly" as const) : ("monthly" as const),
		priority: route === "/" ? 1 : 0.7,
	}));
}
