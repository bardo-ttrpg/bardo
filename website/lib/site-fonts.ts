import { Fraunces, Host_Grotesk, IBM_Plex_Mono } from "next/font/google";

export const siteSans = Host_Grotesk({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-host-grotesk",
});

export const siteMono = IBM_Plex_Mono({
	subsets: ["latin"],
	display: "swap",
	weight: ["400", "500"],
	variable: "--font-ibm-plex-mono",
});

export const siteDisplay = Fraunces({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-fraunces",
});

export const siteBrand = Host_Grotesk({
	subsets: ["latin"],
	display: "swap",
	weight: ["500", "600", "700"],
	variable: "--font-host-grotesk-brand",
});
