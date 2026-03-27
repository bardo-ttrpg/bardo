import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import OptionalClerkProvider from "@/components/optional-clerk-provider";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
import { absoluteUrl, siteConfig } from "@/lib/site-config";
import { siteBrand, siteDisplay, siteMono, siteSans } from "@/lib/site-fonts";
import "./globals.css";

export const metadata: Metadata = {
	metadataBase: new URL(siteConfig.url),
	applicationName: siteConfig.name,
	title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
	description: siteConfig.description,
	keywords: [...siteConfig.keywords],
	category: "games",
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
	colorScheme: "dark light",
	themeColor: [
		{ media: "(prefers-color-scheme: dark)", color: "#0f0f10" },
		{ media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
	],
};

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			data-scroll-behavior="smooth"
			suppressHydrationWarning
			className={`${siteSans.variable} ${siteMono.variable} ${siteDisplay.variable} ${siteBrand.variable}`}
		>
			<body className="font-sans selection:bg-foreground selection:text-background">
				<OptionalClerkProvider enabled={IS_CLERK_CONFIGURED}>
					<RootProvider>
						<a href="#main-content" className="skip-link">
							Skip to content
						</a>
						<div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,255,255,0.08),transparent_68%)] opacity-80" />
						<div className="relative z-[1]">{children}</div>
					</RootProvider>
				</OptionalClerkProvider>
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
	);
}
