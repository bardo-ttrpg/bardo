import { Inter, Newsreader } from "next/font/google";

export const siteReading = Newsreader({
	subsets: ["latin"],
	display: "swap",
	weight: "variable",
	style: ["normal", "italic"],
	axes: ["opsz"],
	variable: "--font-newsreader",
});

export const siteUi = Inter({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-inter",
});
