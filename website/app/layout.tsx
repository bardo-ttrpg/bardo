import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { absoluteUrl, siteConfig } from "@/lib/site-config";
import { siteHeading, siteUi } from "@/lib/site-fonts";
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
	manifest: "/manifest.webmanifest",
	alternates: {
		canonical: "/",
	},
	icons: {
		icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
		apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
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
	themeColor: "#171717",
};
const SHOW_SPEED_INSIGHTS = process.env.VERCEL === "1";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			data-scroll-behavior="smooth"
			suppressHydrationWarning
			className={`${siteHeading.variable} ${siteUi.variable}`}
		>
			<body className="bg-background font-sans text-foreground">
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem={false}
				>
					{children}
				</ThemeProvider>
				{SHOW_SPEED_INSIGHTS ? <SpeedInsights /> : null}
			</body>
		</html>
	);
}
