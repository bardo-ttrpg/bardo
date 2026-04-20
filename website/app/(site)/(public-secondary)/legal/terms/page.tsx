import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryContent, LegalSection } from "../_components/legal-shell";

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
		<LegalEntryContent entry={entry}>
			<LegalSection id="scope" title="Scope of the service">
				<p>
					These terms govern your use of the public Bardo website, the protected
					dashboard, the hosted account layer, subscription billing, bridge
					approvals, and the related service workflows Bard Studio provides.
				</p>
				<p>
					Bardo is a software tool and SaaS service, not a game line, rules
					publisher, or hosted gameplay authority. You decide how you use Bardo
					with your chosen tabletop role-playing games, clients, prompts, and
					local files.
				</p>
			</LegalSection>
			<LegalSection id="accounts-and-access" title="Accounts and access">
				<p>
					You are responsible for the account, credentials, payment method,
					connected clients, machines, and local environments tied to your Bardo
					account. Keep your local workspaces, secrets, and approval flows under
					your control.
				</p>
				<p>
					You may only subscribe or use paid service features if you are legally
					allowed to do so. If a minor uses your account or payment method, that
					responsibility stays with the account holder or authorized adult, not
					with Bard Studio.
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
					responsible for the prompts you send, the tools and TTRPG systems you
					connect, the local files you expose, and the decisions you make based
					on generated output.
				</p>
			</LegalSection>
			<LegalSection id="changes-and-availability" title="Changes and availability">
				<p>
					Bardo may update, improve, or remove parts of the public website or
					hosted account surface over time. When those changes materially affect
					these terms, this page will be updated.
				</p>
				<p>
					Bardo is provided on an <strong>AS IS</strong> and <strong>AS AVAILABLE</strong> basis.
					No refunds apply except where the law requires otherwise. Bard Studio
					does not promise uninterrupted service, refunds, specific
					gameplay outcomes, or error-free operation. Except where the law does
					not allow it, paid subscriptions are non-refundable, and Bard Studio is
					not responsible for indirect, incidental, or consequential damages
					arising from your use of the service.
				</p>
				<p>
					If you use a third-party client, model provider, payment provider, or
					other external service alongside Bardo, you are also responsible for
					complying with that provider&apos;s terms and policies.
				</p>
			</LegalSection>
		</LegalEntryContent>
	);
}
