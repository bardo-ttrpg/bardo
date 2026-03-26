import { createPublicMetadata } from "@/lib/site-metadata";

export const metadata = createPublicMetadata({
	title: "AI Use Policy",
	description:
		"AI output limitations, user responsibility, and reliability expectations for Bardo.",
	path: "/legal/ai-policy",
});

const updatedAt = "March 12, 2026";

export default function AiPolicyPage() {
	return (
		<div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
			<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				/ Legal / AI Policy
			</p>
			<h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				AI Use Policy
			</h1>
			<p className="mb-10 text-xs text-muted-foreground">
				Last updated: {updatedAt}
			</p>

			<div className="space-y-8 text-sm leading-relaxed text-muted-foreground">
				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						1. AI can make mistakes
					</h2>
					<p>
						Outputs generated through Bardo may be inaccurate, incomplete,
						inconsistent, or outdated. Treat outputs as assistive drafts, not as
						verified facts, unless the claim is grounded in canon you have
						confirmed.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						2. User responsibility
					</h2>
					<p>
						You are responsible for reviewing and validating all outputs before
						use. You remain fully responsible for operational, legal, financial,
						and safety impacts of decisions made using AI-generated content,
						including anything written back into your campaign workspace.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						3. High-risk and prohibited reliance
					</h2>
					<p>
						Do not rely on Bardo output as a sole source for legal advice,
						medical decisions, emergency response, or any high-risk scenario
						where errors can cause harm. Independent verification is required.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						4. Content integrity
					</h2>
					<p>
						Do not use Bardo to create deceptive or unlawful content,
						impersonate others, or violate third-party rights. We may restrict
						access for policy or security violations.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						5. Canon, inference, and suggestion
					</h2>
					<p>
						Bardo is designed to keep canon, inference, and suggestion separate.
						You should treat canon as table-approved truth, inference as
						interpreted state, and suggestion as optional creative output until
						you confirm it.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						6. Transparency and claims
					</h2>
					<p>
						Any claims you make to third parties based on AI outputs should be
						clear, truthful, and substantiated under applicable consumer
						protection rules.
					</p>
				</section>

				<section>
					<h2 className="mb-2 text-base font-semibold text-foreground">
						7. Reference guidance
					</h2>
					<ul className="space-y-2">
						<li>
							<a
								href="https://www.ftc.gov/business-guidance/advertising-marketing/advertising-marketing-basics"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								FTC advertising and marketing basics
							</a>
						</li>
						<li>
							<a
								href="https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								FTC children’s privacy (COPPA) guidance
							</a>
						</li>
						<li>
							<a
								href="https://daco.pr.gov/conoce-tus-obligaciones-comerciante/"
								target="_blank"
								rel="noreferrer"
								className="underline underline-offset-2"
							>
								Puerto Rico DACO consumer-merchant obligations guidance
							</a>
						</li>
					</ul>
				</section>
			</div>
		</div>
	);
}
