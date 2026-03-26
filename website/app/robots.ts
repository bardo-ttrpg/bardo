import type { MetadataRoute } from "next";
import { absoluteUrl, siteConfig } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
	return {
		host: new URL(siteConfig.url).host,
		sitemap: absoluteUrl("/sitemap.xml"),
		rules: [
			{
				userAgent: "*",
				allow: ["/", "/docs/", "/pricing", "/legal/"],
				disallow: ["/api/", "/dashboard", "/sign-in", "/sign-up"],
			},
		],
	};
}
