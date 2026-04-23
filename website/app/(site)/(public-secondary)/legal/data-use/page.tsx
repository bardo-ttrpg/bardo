import { getLegalEntryBySlug } from "@/content/legal-content";
import { createPublicMetadata } from "@/lib/site-metadata";
import { LegalEntryContent, LegalSection } from "../_components/legal-shell";

const entry =
	getLegalEntryBySlug("data-use") ??
	(() => {
		throw new Error("Expected legal data use entry to exist.");
	})();

export const metadata = createPublicMetadata({
	title: entry.title,
	description: entry.description,
	path: entry.href,
});

export default function DataUsePage() {
	return (
		<LegalEntryContent entry={entry}>
			<LegalSection
				id="local-files"
				title="Local files and workspace context"
			>
				<p>
					Bardo is designed so your campaign files, notes, and other workspace
					context can stay local. If a question depends on your local files, the
					source of truth should remain your machine rather than the public
					website.
				</p>
				<p>
					This product boundary is intentional: local campaign files stay local
					by default. Bardo&apos;s hosted layer exists to support access and account
					workflows, not to turn the website into a copy of your campaign data.
				</p>
			</LegalSection>
			<LegalSection
				id="hosted-service-data"
				title="Hosted service data"
			>
				<p>
					The hosted Bardo surface may receive and process account details,
					session state, approval requests, subscription state, metering-related
					data, and runtime status information needed to operate the service.
				</p>
				<p>
					That hosted data supports the website and dashboard experience, but it
					is not the same thing as your local campaign or workspace files.
				</p>
			</LegalSection>
			<LegalSection
				id="third-party-clients"
				title="Third-party clients and models"
			>
				<p>
					Bardo can be used alongside external MCP-capable clients and model
					providers. Those tools may send prompts, outputs, or other data to
					their own services under their own policies.
				</p>
				<p>
					Before using any third-party client or model provider, review that
					provider&apos;s own terms, privacy practices, and data-use policy.
				</p>
			</LegalSection>
			<LegalSection id="policy-boundary" title="Policy boundary">
				<p>
					This page explains how Bardo handles its own hosted surface. It does
					not replace the policies of the AI client, model provider, operating
					system, or cloud platform you may choose to use alongside Bardo.
				</p>
				<p>
					If you need a simpler rule, use this one: local campaign files stay
					local to Bardo unless you deliberately connect them to another tool or
					service yourself.
				</p>
			</LegalSection>
		</LegalEntryContent>
	);
}
