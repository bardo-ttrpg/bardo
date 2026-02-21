import { Space_Grotesk } from "next/font/google";
import AmbientParticles from "@/components/ambient-particles";
import ComparisonSection from "./_components/landing/comparison-section";
import CompatibilitySection from "./_components/landing/compatibility-section";
import CtaSection from "./_components/landing/cta-section";
import HeroSection from "./_components/landing/hero-section";
import ManifestoSection from "./_components/landing/manifesto-section";
import TerminalDemoSection from "./_components/landing/terminal-demo-section";
import VideoSection from "./_components/landing/video-section";
import WorkspaceSection from "./_components/landing/workspace-section";
import WorldMapSection from "./_components/landing/world-map-section";

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	weight: "700",
	display: "swap",
});

export default function LandingPage() {
	return (
		<div>
			<AmbientParticles />
			<HeroSection wordmarkClassName={spaceGrotesk.className} />
			<div className="mx-auto max-w-7xl px-4 sm:px-6">
				<ComparisonSection />
				<WorkspaceSection />
				<TerminalDemoSection />
				<VideoSection />
				<CompatibilitySection />
			</div>
			<ManifestoSection />
			<WorldMapSection />
			<CtaSection />
		</div>
	);
}
