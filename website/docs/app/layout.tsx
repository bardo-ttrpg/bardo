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
				<a href="#main-content" className="skip-link">
					Skip to content
				</a>
				<div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.055),transparent_70%)] dark:bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.06),transparent_72%)]" />
				<div className="relative z-[1]">{children}</div>
			</body>
		</html>
	);
}
