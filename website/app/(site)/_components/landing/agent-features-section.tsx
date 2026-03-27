"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export default function AgentFeaturesSection() {
	return (
		<section className="py-24">
			<h2 className="mb-20 text-center text-4xl font-semibold tracking-tight text-foreground md:text-5xl lg:text-6xl">
				What Bardo changes in practice
			</h2>

			<FeatureBlock
				title="Keep canon local while the agent keeps moving"
				description="Bardo lets the website handle auth, approval, and billing while your campaign files stay in the workspace you already trust."
				alignment="left"
			>
				<EngineeringDemoMockup />
			</FeatureBlock>

			<FeatureBlock
				title="Review the run before anything writes"
				description="Every bridge session is readable. You can see which files are being inspected, which canon is being updated, and why the write path is safe."
				alignment="right"
			>
				<EngineeringDemoMockup />
			</FeatureBlock>
		</section>
	);
}

function FeatureBlock({
	title,
	description,
	alignment,
	children,
}: {
	title: string;
	description: string;
	alignment: "left" | "right";
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setIsVisible(true);
				}
			},
			{ threshold: 0.2 },
		);

		if (ref.current) {
			observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={ref}
			className={`mb-32 grid items-center gap-12 last:mb-0 md:grid-cols-2 md:gap-16 ${
				alignment === "right" ? "md:[direction:rtl]" : ""
			}`}
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? "translateY(0)" : "translateY(40px)",
				transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
			}}
		>
			<div className={alignment === "right" ? "md:[direction:ltr]" : ""}>
				<h3 className="mb-4 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
					{title}
				</h3>
				<p className="max-w-md text-base leading-relaxed text-muted-foreground">
					{description}
				</p>
			</div>

			<div className={alignment === "right" ? "md:[direction:ltr]" : ""}>
				{children}
			</div>
		</div>
	);
}

function EngineeringDemoMockup() {
	return (
		<div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-xl">
			<div className="absolute inset-0 bg-gradient-to-br from-secondary/50 via-transparent to-secondary/30" />

			<div className="relative p-6">
				<div className="mb-4 flex justify-end">
					<div className="rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground">
						Refresh the campaign truth before session 18.
					</div>
				</div>

				<div className="space-y-3 text-sm text-muted-foreground">
					<p className="leading-relaxed">
						{
							"I'll read the latest canonical events, reconcile the current state projection, and stage only the files that need a continuity update inside "
						}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">
							./campaign
						</code>
						{" so the workspace stays auditable."}
					</p>

					<div className="flex items-center gap-4 text-xs text-muted-foreground">
						<span>Thought 8s</span>
						<span>Explored 3 files</span>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Edited</span>
								<span className="font-mono text-foreground">
									projections/current-state.md
								</span>
							</div>
							<span className="text-muted-foreground">&#10003;</span>
						</div>
						<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Editing</span>
								<span className="font-mono text-foreground">
									events/canonical.ndjson
								</span>
							</div>
							<span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
						</div>
					</div>
				</div>

				<div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
					<input
						type="text"
						placeholder="Ask Bardo to reconcile your canon"
						className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
						disabled
					/>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<span>+</span>
						<span>Remote MCP</span>
					</div>
				</div>
			</div>
		</div>
	);
}
