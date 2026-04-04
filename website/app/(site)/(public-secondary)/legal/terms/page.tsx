import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryShell, LegalSection } from "../_components/legal-shell";

const entry =
	getLegalEntryBySlug("terms") ??
	(() => {
		throw new Error("Expected legal terms entry to exist.");
	})();

export const metadata = createPublicMetadata({
	title: entry.title,
	description: entry.description,
	path: entry.href,
});

export default function TermsPage() {
	return (
		<LegalEntryShell entry={entry}>
			<LegalSection id="scope" title="Scope of the service">
				<p>
					These terms govern access to the public Bardo website, the protected
					dashboard, and the hosted workflows used for account access, bridge
					approvals, billing, metering, and related status checks.
				</p>
				<p>
					Bardo is designed to work with local campaign or workspace files
					without turning the public website into the source of truth for that
					content. The hosted service exists to support access control and the
					account layer around those local workflows.
				</p>
			</LegalSection>
			<LegalSection id="accounts-and-access" title="Accounts and access">
				<p>
					You are responsible for the credentials, clients, machines, and local
					environments connected to your Bardo account. Keep your local
					workspaces, secrets, and approval flows under your control.
				</p>
				<p>
					If you use a third-party client or model provider alongside Bardo, you
					are also responsible for complying with that provider&apos;s terms and
					policies.
				</p>
			</LegalSection>
			<LegalSection id="acceptable-use" title="Acceptable use">
				<p>
					Do not use Bardo to break the law, interfere with account access,
					abuse billing flows, bypass approval checks, or attempt to access
					workspaces, sessions, or data that you are not authorized to control.
				</p>
				<p>
					AI-assisted outputs and actions still require human review. You remain
					responsible for the prompts you send, the tools you connect, and the
					decisions you make based on generated output.
				</p>
			</LegalSection>
			<LegalSection
				id="changes-and-availability"
				title="Changes and availability"
			>
				<p>
					Bardo may update, improve, or remove parts of the public website or
					hosted account surface over time. When those changes materially affect
					these terms, this page will be updated.
				</p>
				<p>
					Bardo does not promise uninterrupted availability. Temporary outages,
					maintenance, or dependency-related interruptions can occur while the
					service is being operated and improved.
				</p>
			</LegalSection>
		</LegalEntryShell>
	);
}
