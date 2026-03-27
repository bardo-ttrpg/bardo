import AmbientParticles from "@/components/ambient-particles";
import StructuredData from "@/components/structured-data";
import { displayPriceCents } from "@/lib/billing-catalog";
import { createPublicMetadata } from "@/lib/site-metadata";
import AgentFeaturesSection from "./_components/landing/agent-features-section";
import CodexHeroSection from "./_components/landing/codex-hero-section";
import IdeDemoSection from "./_components/landing/ide-demo-section";
import LogoCarousel from "./_components/landing/logo-carousel";
import TestimonialsSection from "./_components/landing/testimonials-section";

export const metadata = createPublicMetadata({
	title:
		"Paid Remote MCP for AI Game Mastering Over Your Local TTRPG Workspace",
	description:
		"Bardo is a paid remote MCP that gives AI clients a guarded, canon-aware TTRPG tool layer while your campaign files stay local in your own workspace.",
	path: "/",
	keywords: [
		"AI game master",
		"remote MCP server",
		"Clerk billing",
		"TTRPG continuity",
		"local workspace bridge",
		"system agnostic TTRPG tool",
	],
});

export default function LandingPage() {
	const monthlyPrice = (displayPriceCents("solo", "month") / 100).toFixed(2);
	const yearlyPrice = (displayPriceCents("solo", "year") / 100).toFixed(2);
	const structuredData = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "Bardo",
		applicationCategory: "GameApplication",
		operatingSystem: "macOS, Linux, Windows",
		description:
			"Bardo is a system-agnostic remote MCP that helps AI clients run TTRPG campaigns against a user-selected local workspace.",
		url: "https://www.bardo.gg",
		offers: {
			"@type": "AggregateOffer",
			offerCount: 2,
			lowPrice: monthlyPrice,
			highPrice: yearlyPrice,
			priceCurrency: "USD",
			description:
				"Subscribe monthly or yearly to unlock the full Bardo MCP toolset.",
		},
		featureList: [
			"Paid remote MCP access",
			"Browser-approved bridge sessions",
			"Full AI GM and world-simulation toolset for local campaign workspaces",
			"Clerk auth and billing",
			"Canon-aware continuity reports",
		],
	};

	return (
		<div>
			<StructuredData data={structuredData} />
			<AmbientParticles />
			<CodexHeroSection />
			<LogoCarousel />
			<div className="mx-auto max-w-7xl px-4 sm:px-6">
				<AgentFeaturesSection />
				<IdeDemoSection />
				<TestimonialsSection />
			</div>
		</div>
	);
}
