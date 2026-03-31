import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { absoluteUrl, siteConfig } from "@/lib/site-config";
import { siteCode, siteReading, siteUi } from "@/lib/site-fonts";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(siteConfig.url),
	applicationName: siteConfig.name,
	title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
	description: siteConfig.description,
	keywords: [...siteConfig.keywords],
	category: "technology",
	creator: siteConfig.creator,
	publisher: siteConfig.publisher,
	referrer: "origin-when-cross-origin",
	alternates: {
		canonical: "/",
	},
	robots: {
		index: true,
		follow: true,
		nocache: false,
		googleBot: {
			index: true,
			follow: true,
			noimageindex: false,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	openGraph: {
		title: siteConfig.name,
		description: siteConfig.ogDescription,
		url: siteConfig.url,
		siteName: siteConfig.name,
		locale: siteConfig.locale,
		type: "website",
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
		title: siteConfig.name,
		description: siteConfig.ogDescription,
		images: [absoluteUrl("/twitter-image")],
	},
};

export const viewport: Viewport = {
	colorScheme: "dark",
	themeColor: "#000000",
};

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${siteReading.variable} ${siteUi.variable} ${siteCode.variable}`}
		>
			<body className="bg-background text-foreground antialiased">
				<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
					{children}
				</OptionalClerkProvider>
			</body>
		</html>
	);
}
