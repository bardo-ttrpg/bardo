import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site-config";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: siteConfig.name,
		short_name: siteConfig.shortName,
		description: siteConfig.description,
		start_url: "/",
		scope: "/",
		display: "browser",
		background_color: "#ffffff",
		theme_color: "#ffffff",
		lang: "en-US",
		categories: ["games", "entertainment", "utilities"],
		icons: [
			{
				src: "/icon.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
	};
}
