"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export default function AgentFeaturesSection() {
	return (
		<section className="py-24">
			<h2 className="mb-20 text-center text-4xl font-semibold tracking-tight text-foreground md:text-5xl lg:text-6xl">
				The best way to build with agents
			</h2>

			<FeatureBlock
				title="Built to drive real engineering work"
				description="From routine pull requests to your hardest problems, Codex reliably completes tasks end to end, like building features, complex refactors, migrations, and more, powered by OpenAI's frontier coding models."
				alignment="left"
			>
				<EngineeringDemoMockup />
			</FeatureBlock>

			<FeatureBlock
				title="Built to drive real engineering work"
				description="From routine pull requests to your hardest problems, Codex reliably completes tasks end to end, like building features, complex refactors, migrations, and more, powered by OpenAI's frontier coding models."
				alignment="left"
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
						Hey Codex, implement dark mode
					</div>
				</div>

				<div className="space-y-3 text-sm text-muted-foreground">
					<p className="leading-relaxed">
						{
							"I'll trace the existing theme entry points, add a proper light/dark theme model, persist the user preference, and apply the "
						}
						<code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">
							dark
						</code>
						{" class early so we avoid a flash on load."}
					</p>

					<div className="flex items-center gap-4 text-xs text-muted-foreground">
						<span>Thought 8s</span>
						<span>Explored 3 files</span>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Edited</span>
								<span className="font-mono text-foreground">theme.ts</span>
							</div>
							<span className="text-muted-foreground">&#10003;</span>
						</div>
						<div className="flex items-center justify-between rounded border border-border bg-secondary/50 px-3 py-2">
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Editing</span>
								<span className="font-mono text-foreground">main.tsx</span>
							</div>
							<span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
						</div>
					</div>
				</div>

				<div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3">
					<input
						type="text"
						placeholder="Ask Codex anything"
						className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
						disabled
					/>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<span>+</span>
						<span>GPT-5.4</span>
					</div>
				</div>
			</div>
		</div>
	);
}
