import type { MetadataRoute } from "next";
import { listLegalEntries } from "@/content/legal-content";
import { absoluteUrl, siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
	const legalRoutes = listLegalEntries().map((entry) => entry.href);

	return {
		host: new URL(siteConfig.url).host,
		sitemap: absoluteUrl("/sitemap.xml"),
		rules: [
			{
				userAgent: "*",
				allow: [
					"/",
					"/docs",
					"/blog",
					"/pricing",
					...legalRoutes,
				],
				disallow: [
					"/api/",
					"/dashboard",
					"/sign-in",
					"/sign-up",
				],
			},
		],
	};
}
