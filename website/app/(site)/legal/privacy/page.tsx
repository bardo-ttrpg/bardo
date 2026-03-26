import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
	title: "Privacy Policy",
	description:
		"Data collection, purpose, retention, and sharing policy for Bardo.",
	path: "/legal/privacy",
});

const updatedAt = "March 12, 2026";

export default function PrivacyPage() {
	return (
		<div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ Legal / Privacy
			</p>
			<h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				Privacy Policy
			</h1>
			<p className="mb-10 text-xs text-muted-foreground">
				Last updated: {updatedAt}
			</p>

			<div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						1. What data we collect
					</h2>
					<p>
						We collect account and auth metadata (for example email address,
						user identifier, profile image URL), service telemetry (for example
						MCP call counts and timestamps), billing metadata, and content you
						submit through the website, API, and MCP tools. Local workspace
						files created by the CLI stay on your machine unless you choose to
						upload or share them through a hosted feature.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						2. Why we collect data
					</h2>
					<p>
						We use data to provide and secure the service, authenticate users,
						prevent abuse, measure usage limits, maintain billing records, and
						improve reliability and performance.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						3. Data sharing
					</h2>
					<p>
						We do not sell personal data. We do not share personal data with
						third parties without user consent, except when required to operate
						the service (for example infrastructure/auth providers), comply with
						law, or protect security and legal rights.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						4. Retention and deletion
					</h2>
					<p>
						We keep data only as long as needed for service operation, security,
						auditing, and legal obligations. You may request account deletion at
						any time by contacting{" "}
						<a
							href="mailto:privacy@bardo.gg"
							className="underline underline-offset-2"
						>
							privacy@bardo.gg
						</a>
						.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						5. Security and incident response
					</h2>
					<p>
						We apply technical and organizational safeguards appropriate to
						risk. If a security incident affects personal data, we provide
						notice as required by applicable law, including Puerto Rico
						breach-notification requirements.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						6. Children and minors
					</h2>
					<p>
						We do not knowingly collect personal information from children under
						13 without legally required consent. If we learn that such data was
						collected without required authorization, we will delete it.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						7. Legal references (U.S./Puerto Rico)
					</h2>
					<ul className="space-y-2">
						<li>
							<a
								href="https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								FTC COPPA guidance (children’s privacy)
							</a>
						</li>
						<li>
							<a
								href="https://www.lexjuris.com/lexlex/Leyes2005/lexl2005111.htm"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								Puerto Rico Law 111-2005 (breach-notification framework)
							</a>
						</li>
						<li>
							<a
								href="https://www.lexjuris.com/lexlex/Leyes2024/lexl2024185.htm"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								Puerto Rico Law 185-2024 (minors’ online privacy protections)
							</a>
						</li>
					</ul>
				</section>
			</div>
		</div>
	);
}
