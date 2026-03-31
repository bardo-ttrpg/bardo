import { createPublicMetadata } from "@/lib/site-metadata";
import {
	PublicPageHeader,
	PublicPageShell,
	RouteList,
} from "../_components/site-shells";

export const metadata = createPublicMetadata({
	title: "Legal",
	description: "Terms, privacy, and AI policy for the public Bardo surface.",
	path: "/legal",
});

export default function LegalIndexPage() {
	return (
		<PublicPageShell>
			<PublicPageHeader
				eyebrow="Legal"
				title="Legal pages, kept small."
				description="These routes are public and permanent even after the broader site cleanup."
			/>
			<RouteList
				items={[
					{
						href: "/legal/terms",
						label: "Terms",
						description:
							"Use of service, access expectations, and account rules.",
					},
					{
						href: "/legal/privacy",
						label: "Privacy",
						description:
							"What the website collects, how long it is retained, and how to contact us.",
					},
					{
						href: "/legal/ai-policy",
						label: "AI policy",
						description:
							"Acceptable use boundaries for prompts, outputs, and protected data.",
					},
				]}
			/>
		</PublicPageShell>
	);
}
