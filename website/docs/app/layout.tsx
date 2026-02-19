import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: { default: "Bardo", template: "%s | Bardo" },
	description:
		"Bardo converts AI coding agents into system-agnostic TTRPG game masters.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${GeistSans.variable} ${GeistMono.variable}`}
		>
			<body className="font-sans">
				<div className="relative z-[1]">{children}</div>
			</body>
		</html>
	);
}
