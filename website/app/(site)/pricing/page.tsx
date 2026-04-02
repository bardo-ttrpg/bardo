import { createPublicMetadata } from "@/lib/site-metadata";
import {
	InlineLinkNav,
	ProseSection,
	PublicPageHeader,
	PublicPageShell,
} from "../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Pricing",
	description:
		"Bardo keeps pricing simple: one public entry point, local campaign files, and hosted account access for the bridge that powers solo tabletop RPG play.",
	path: "/pricing",
});

export default function PricingPage() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Pricing"
				title="Simple by design."
				description="Bardo keeps the commercial surface narrow so the product can stay focused on solo tabletop play, local files, and the bridge that connects your AI client to your campaign."
			/>
			<ProseSection title="Current model">
				<p>
					Bardo is offered as a single subscription with usage-aware limits
					managed from your account dashboard.
				</p>
				<p>
					Your billing, bridge approvals, and account access live in the hosted
					app. Your campaign files stay on your machine.
				</p>
				<p>
					If you already have access, head to the dashboard to review the plan
					attached to your account and continue playing.
				</p>
			</ProseSection>
			<InlineLinkNav
				links={[
					{ href: "/", label: "Home" },
					{ href: "/docs", label: "Docs" },
					{ href: "/dashboard", label: "Dashboard" },
				]}
			/>
		</PublicPageShell>
	);
}
