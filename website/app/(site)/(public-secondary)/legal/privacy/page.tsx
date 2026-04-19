import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryContent, LegalSection } from "../_components/legal-shell";

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
		<LegalEntryContent entry={entry}>
			<LegalSection
				id="what-bardo-collects"
				title="What Bardo collects"
			>
				<p>
					Bardo keeps the hosted website surface intentionally small. The hosted
					layer may process account, authentication, subscription, billing,
					approval, and session-status information needed to operate sign-in,
					protected dashboard routes, bridge approvals, and related account
					workflows.
				</p>
				<p>
					That hosted data exists for account operation only. Bard Studio does
					not use the website to collect or host your local campaign canon as a
					normal part of the product.
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
					Bardo has no sale of user data, and it does not use your hosted
					account data to turn the service into a hosted copy of your local
					campaign workspace. Third-party clients, model providers, and other
					tools you connect have their own separate privacy practices.
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
					run account access, billing, approval workflows, or bridge status
					checks.
				</p>
			</LegalSection>
			<LegalSection
				id="retention-and-requests"
				title="Retention and requests"
			>
				<p>
					Bardo retains hosted data only as needed to operate the service,
					support accounts and subscriptions, comply with legal obligations, and
					troubleshoot issues. Retention can vary by workflow and dependency.
				</p>
				<p>
					Questions about privacy or data handling can be directed through the
					main Bardo support channels.
				</p>
			</LegalSection>
		</LegalEntryContent>
	);
}
