import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import type { ReactNode } from "react";
import AmbientParticles from "@/components/ambient-particles";
import ConvexClientProvider from "@/components/convex-provider";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: { default: "Bardo", template: "%s | Bardo" },
	description:
		"Bardo converts AI coding agents into system-agnostic TTRPG game masters.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	const isClerkConfigured = isClerkPublishableKeyConfigured(
		process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	);
	const app = (
		<ConvexClientProvider useClerk={isClerkConfigured}>
			{/* Deferred ambient particles for lower first-load cost */}
			<AmbientParticles />
			{/* All site content — z-1 above particles, transparent so particles show through */}
			<div className="relative z-[1]">{children}</div>
		</ConvexClientProvider>
	);

	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${geistSans.variable} ${geistMono.variable}`}
		>
			<body className="font-sans">
				{isClerkConfigured ? <ClerkProvider>{app}</ClerkProvider> : app}
			</body>
		</html>
	);
}
