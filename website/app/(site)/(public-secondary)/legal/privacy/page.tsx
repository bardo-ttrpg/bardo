import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryShell, LegalSection } from "../_components/legal-shell";

const entry =
	getLegalEntryBySlug("privacy") ??
	(() => {
		throw new Error("Expected legal privacy entry to exist.");
	})();

export const metadata = createPublicMetadata({
	title: entry.title,
	description: entry.description,
	path: entry.href,
});

export default function PrivacyPage() {
	return (
		<LegalEntryShell entry={entry}>
			<LegalSection
				id="what-bardo-collects"
				title="What Bardo collects"
			>
				<p>
					Bardo keeps the hosted website surface intentionally small. The hosted
					layer may process the account, authentication, subscription, approval,
					and metering information required to operate sign-in, billing, and
					protected dashboard routes.
				</p>
				<p>
					The exact data involved depends on the workflow you use. For example,
					account access and billing depend on identity and subscription state,
					while bridge approval flows depend on session and status data.
				</p>
			</LegalSection>
			<LegalSection
				id="how-bardo-uses-data"
				title="How Bardo uses data"
			>
				<p>
					Bardo uses hosted data to run the website, authenticate users, show
					dashboard state, support subscription handling, meter usage-related
					workflows, and support bridge approval or status checks.
				</p>
				<p>
					This privacy page describes the Bardo-hosted surface only. Third-party
					clients, model providers, and other tools you connect may have their
					own separate privacy practices.
				</p>
			</LegalSection>
			<LegalSection id="what-stays-local" title="What stays local">
				<p>
					Bardo is built around a local-first product boundary. Campaign files,
					notes, and workspace content remain on your machine unless you choose
					to send them somewhere else through a separate client or model
					provider.
				</p>
				<p>
					The Bardo website does not need your local campaign files in order to
					run account access, billing, or approval workflows.
				</p>
			</LegalSection>
			<LegalSection
				id="retention-and-requests"
				title="Retention and requests"
			>
				<p>
					Bardo retains hosted data only as needed to operate the website and
					account layer, comply with obligations, and troubleshoot service
					issues. Retention may vary by workflow and dependency.
				</p>
				<p>
					Questions about privacy or data handling can be directed through the
					main Bardo support channels.
				</p>
			</LegalSection>
		</LegalEntryShell>
	);
}
