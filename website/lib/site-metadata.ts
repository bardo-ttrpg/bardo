import type { Metadata } from "next";
import { absoluteUrl, siteConfig } from "./site-config";

type PublicMetadataOptions = {
	title: string;
	description: string;
	path: string;
	keywords?: readonly string[];
	type?: "website" | "article";
};

export function createPublicMetadata(options: PublicMetadataOptions): Metadata {
	const canonical = absoluteUrl(options.path);
	const keywords = [...(options.keywords ?? siteConfig.keywords)];
	const type = options.type ?? "website";

	return {
		title: options.title,
		description: options.description,
		alternates: { canonical },
		keywords,
		category: "technology",
		creator: siteConfig.creator,
		publisher: siteConfig.publisher,
		robots: {
			index: true,
			follow: true,
			googleBot: {
				index: true,
				follow: true,
				noimageindex: false,
				"max-image-preview": "large",
				"max-snippet": -1,
				"max-video-preview": -1,
			},
		},
		openGraph: {
			title: `${options.title} | ${siteConfig.name}`,
			description: options.description,
			url: canonical,
			siteName: siteConfig.name,
			locale: siteConfig.locale,
			type,
			images: [
				{
					url: absoluteUrl("/opengraph-image"),
					width: 1200,
					height: 630,
					alt: `${siteConfig.name} preview card`,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: `${options.title} | ${siteConfig.name}`,
			description: options.description,
			images: [absoluteUrl("/twitter-image")],
		},
	};
}

export function createPrivateMetadata(title: string): Metadata {
	return {
		title,
		robots: {
			index: false,
			follow: false,
			nocache: true,
			googleBot: {
				index: false,
				follow: false,
				noimageindex: true,
				"max-image-preview": "none",
				"max-snippet": 0,
				"max-video-preview": 0,
			},
		},
	};
}
