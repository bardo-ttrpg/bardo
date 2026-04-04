import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryShell, LegalSection } from "../_components/legal-shell";

const entry =
	getLegalEntryBySlug("security") ??
	(() => {
		throw new Error("Expected legal security entry to exist.");
	})();

export const metadata = createPublicMetadata({
	title: entry.title,
	description: entry.description,
	path: entry.href,
});

export default function SecurityPage() {
	return (
		<LegalEntryShell entry={entry}>
			<LegalSection
				id="design-boundary"
				title="Security by design boundary"
			>
				<p>
					Bardo&apos;s main security posture starts with product scope. The service
					is designed to keep campaign files and workspace context local where
					possible, while the hosted surface focuses on account access,
					approvals, billing, metering, and status-related workflows.
				</p>
				<p>
					That means the Bardo website is not intended to be the primary home
					for your local campaign content.
				</p>
			</LegalSection>
			<LegalSection id="hosted-surface" title="Hosted surface">
				<p>
					The hosted surface includes the public website, authentication and
					dashboard flows, subscription handling, and bridge approval or session
					workflows. Like any hosted service, that surface still depends on
					software updates, infrastructure, and third-party providers.
				</p>
				<p>
					This page is a high-level overview only. It should not be read as a
					promise of specific certifications, audit results, or formal security
					commitments that Bardo does not publicly publish.
				</p>
			</LegalSection>
			<LegalSection
				id="user-responsibilities"
				title="User responsibilities"
			>
				<p>
					You are responsible for securing the machines, clients, credentials,
					and local workspaces you connect to Bardo. Review generated output,
					control which tools you authorize, and protect any secrets stored in
					your own environment.
				</p>
				<p>
					If you use Bardo through another client or AI provider, that external
					toolchain becomes part of your security boundary as well.
				</p>
			</LegalSection>
			<LegalSection id="security-questions" title="Security questions">
				<p>
					Bardo will update this page if the public security posture or hosted
					service boundary changes materially. Questions about security can be
					sent through the main Bardo support channels.
				</p>
			</LegalSection>
		</LegalEntryShell>
	);
}
