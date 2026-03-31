import { createPublicMetadata } from "@/lib/site-metadata";
import {
	InlineLinkNav,
	ProseSection,
	PublicPageHeader,
	PublicPageShell,
} from "../../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "AI Policy",
	description:
		"Acceptable use expectations for Bardo prompts, outputs, and tools.",
	path: "/legal/ai-policy",
});

export default function AiPolicyPage() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Legal / AI Policy"
				title="AI policy"
				description="Acceptable use guidance for prompts, outputs, and protected workflows that touch the Bardo service."
			/>
			<ProseSection title="Acceptable use">
				<p>
					Do not use Bardo to violate laws, exfiltrate protected data, abuse
					accounts, or attempt to bypass billing, rate limits, or bridge
					approval checks.
				</p>
			</ProseSection>
			<ProseSection title="Human responsibility">
				<p>
					Outputs can be wrong. You remain responsible for reviewing generated
					actions, approvals, and decisions before relying on them.
				</p>
			</ProseSection>
			<ProseSection title="Protected data">
				<p>
					Keep secrets, credentials, and private campaign material out of public
					channels, and only connect workspaces you are authorized to control.
				</p>
			</ProseSection>
			<InlineLinkNav
				links={[
					{ href: "/legal", label: "Legal index" },
					{ href: "/legal/privacy", label: "Privacy" },
				]}
			/>
		</PublicPageShell>
	);
}
