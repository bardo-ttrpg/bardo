import { createPublicMetadata } from "@/lib/site-metadata";
import {
	InlineLinkNav,
	ProseSection,
	PublicPageHeader,
	PublicPageShell,
} from "../../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Privacy",
	description: "Privacy summary for the public Bardo website and dashboard.",
	path: "/legal/privacy",
});

export default function PrivacyPage() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Legal / Privacy"
				title="Privacy"
				description="Effective March 28, 2026. This summary covers the minimal website, account access, and protected dashboard requests."
			/>
			<ProseSection title="Effective date">
				<p>Effective March 28, 2026.</p>
			</ProseSection>
			<ProseSection title="What we collect">
				<p>
					The website is intentionally small. We collect the minimum account,
					auth, and billing information required to operate Clerk-backed sign-in
					and the protected dashboard routes.
				</p>
			</ProseSection>
			<ProseSection title="Bridge-related requests">
				<p>
					Local workspace files stay local. Remote endpoints receive only the
					requests needed for access control, bridge approval, subscription
					state, and metering.
				</p>
			</ProseSection>
			<ProseSection title="Contact">
				<p>
					Questions about privacy can be directed through the main Bardo support
					channels.
				</p>
			</ProseSection>
			<InlineLinkNav
				links={[
					{ href: "/legal/terms", label: "Terms" },
					{ href: "/legal/ai-policy", label: "AI policy" },
				]}
			/>
		</PublicPageShell>
	);
}
