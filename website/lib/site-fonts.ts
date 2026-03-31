import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Newsreader } from "next/font/google";

export const siteReading = Newsreader({
	subsets: ["latin"],
	display: "swap",
	weight: "variable",
	style: ["normal", "italic"],
	axes: ["opsz"],
	variable: "--font-newsreader",
});

export const siteUi = GeistSans;

export const siteCode = GeistMono;
