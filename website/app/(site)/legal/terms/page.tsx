import { createPublicMetadata } from "@/lib/site-metadata";
import {
	InlineLinkNav,
	ProseSection,
	PublicPageHeader,
	PublicPageShell,
} from "../../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Terms",
	description:
		"Terms for using the Bardo website, dashboard, and auth surface.",
	path: "/legal/terms",
});

export default function TermsPage() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Legal / Terms"
				title="Terms"
				description="Use of service for the public website, account access, and protected dashboard routes."
			/>
			<ProseSection title="Use of service">
				<p>
					Use the website and dashboard lawfully and do not attempt to interfere
					with bridge approvals, billing, or account access.
				</p>
			</ProseSection>
			<ProseSection title="Accounts">
				<p>
					You are responsible for your credentials, any activity performed from
					your account, and the local environments you connect through the
					bridge flow.
				</p>
			</ProseSection>
			<ProseSection title="Availability">
				<p>
					We may change or remove parts of the public website surface, but the
					remaining routes will continue to reflect the current product shape as
					clearly as possible.
				</p>
			</ProseSection>
			<InlineLinkNav
				links={[
					{ href: "/legal/privacy", label: "Privacy" },
					{ href: "/legal/ai-policy", label: "AI policy" },
				]}
			/>
		</PublicPageShell>
	);
}
