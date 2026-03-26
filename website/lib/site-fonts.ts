import localFont from "next/font/local";

export const siteSans = localFont({
	src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
	variable: "--font-geist-sans",
	display: "swap",
	preload: true,
	fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const siteMono = localFont({
	src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
	variable: "--font-geist-mono",
	display: "swap",
	preload: false,
	fallback: ["ui-monospace", "monospace"],
});
