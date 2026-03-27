import {
	Geist,
	Geist_Mono,
	Instrument_Serif,
	Space_Grotesk,
} from "next/font/google";

export const siteSans = Geist({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-geist-sans",
});

export const siteMono = Geist_Mono({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-geist-mono",
});

export const siteDisplay = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
	display: "swap",
	variable: "--font-instrument-serif",
});

export const siteBrand = Space_Grotesk({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-space-grotesk",
});
