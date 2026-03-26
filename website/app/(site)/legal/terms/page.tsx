import Link from "next/link";
import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
	title: "Terms of Service",
	description:
		"Terms for using the Bardo website, hosted MCP service, API routes, and local CLI.",
	path: "/legal/terms",
});

const updatedAt = "March 12, 2026";

export default function TermsPage() {
	return (
		<div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ Legal / Terms
			</p>
			<h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				Terms of Service
			</h1>
			<p className="mb-10 text-xs text-muted-foreground">
				Last updated: {updatedAt}
			</p>

			<div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						1. Agreement to terms
					</h2>
					<p>
						By accessing or using Bardo, including the website, hosted MCP
						service, API routes, and local CLI, you agree to these Terms, our{" "}
						<Link
							href="/legal/privacy"
							className="underline underline-offset-2"
						>
							Privacy Policy
						</Link>
						, and our{" "}
						<Link
							href="/legal/ai-policy"
							className="underline underline-offset-2"
						>
							AI Use Policy
						</Link>
						. If you do not agree, do not use the service.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						2. Eligibility and account responsibility
					</h2>
					<p>
						You are responsible for all activity under your account, API keys,
						hosted usage, and connected MCP clients. If you are under 18, a
						parent or legal guardian must review and accept these Terms and is
						responsible for your use.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						3. Acceptable use
					</h2>
					<p>
						You may not use Bardo to violate law, abuse systems, attempt
						unauthorized access, or process data you are not authorized to
						process. You are responsible for securing credentials, controlling
						access to local workspaces, and reviewing all AI-generated output
						before acting on it.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						4. AI output limitations
					</h2>
					<p>
						Bardo can produce inaccurate, incomplete, or outdated output. AI
						output is provided for assistance only. Canon, inference, and
						suggestion should be reviewed by the user, and Bardo is not legal,
						medical, financial, or safety-critical advice. You remain solely
						responsible for final decisions and consequences.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						5. Billing and refunds
					</h2>
					<p>
						Paid plans are billed as shown at checkout through Clerk Billing.
						Hosted plans grant monthly credits, and one accepted MCP tool call
						consumes one credit. Unless required by applicable law, payments are
						non-refundable and unused credits do not roll over between billing
						periods.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						6. Local files and hosted services
					</h2>
					<p>
						Bardo keeps campaign workspace files local by default. Files in your
						workspace remain under your control on your machine unless you
						explicitly upload or share them through a hosted feature. Hosted
						account data, usage records, and billing metadata remain subject to
						these Terms and our Privacy Policy.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						7. Suspension and termination
					</h2>
					<p>
						We may suspend or terminate access for abuse, security risk,
						non-payment, or Terms violations. You may stop using Bardo at any
						time.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						8. Disclaimer and liability limits
					</h2>
					<p>
						Bardo is provided “as is” and “as available” without warranties to
						the maximum extent permitted by law. To the maximum extent permitted
						by law, Bardo is not liable for indirect, incidental, special,
						consequential, or exemplary damages.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						9. Governing law
					</h2>
					<p>
						These Terms are governed by the laws of Puerto Rico and applicable
						United States federal law, without regard to conflict-of-law rules.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						10. Contact
					</h2>
					<p>
						For legal requests, privacy requests, or notices, contact:{" "}
						<a
							href="mailto:legal@bardo.gg"
							className="underline underline-offset-2"
						>
							legal@bardo.gg
						</a>
						.
					</p>
				</section>

				<section className="border-t border-border pt-6 text-xs">
					<p>
						Compliance note: this template reflects U.S./Puerto Rico guidance as
						of {updatedAt} and should be reviewed by licensed counsel before
						production use.
					</p>
				</section>
			</div>
		</div>
	);
}
