"use client";

import { useEffect, useRef, useState } from "react";

const proofPoints = [
	{
		title: "Local canon stays local",
		body: "Bardo is built around a local workspace. The remote layer meters and orchestrates, but the actual campaign files remain in your own directory.",
	},
	{
		title: "Approval is part of the flow",
		body: "Bridge sessions make the write path visible before local files change, so campaign updates stay reviewable instead of disappearing into a black box.",
	},
	{
		title: "Readable files over hidden state",
		body: "Events, projections, and audits live in Markdown and NDJSON so both humans and agents can inspect the same campaign truth.",
	},
	{
		title: "Works with the clients you already use",
		body: "The product is designed for MCP-capable clients, not a new editor lock-in. You keep your preferred surface and Bardo supplies the guarded tool layer.",
	},
	{
		title: "Built for long-form continuity",
		body: "The value is not one flashy generation. It is surviving session after session with enough structure to reconcile drift and preserve canon.",
	},
	{
		title: "Small surface, clear boundary",
		body: "The website handles auth, billing, and approval. The bridge handles local access. The remote MCP stays focused on guarded orchestration.",
	},
] as const;

export default function TestimonialsSection() {
	const ref = useRef<HTMLElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) {
					setIsVisible(true);
				}
			},
			{ threshold: 0.1 },
		);

		if (ref.current) {
			observer.observe(ref.current);
		}

		return () => observer.disconnect();
	}, []);

	return (
		<section ref={ref} className="py-24">
			<h2
				className="mb-16 text-center text-4xl font-semibold tracking-tight text-foreground md:text-5xl"
				style={{
					opacity: isVisible ? 1 : 0,
					transform: isVisible ? "translateY(0)" : "translateY(20px)",
					transition: "opacity 0.6s ease-out, transform 0.6s ease-out",
				}}
			>
				Why the product holds up
			</h2>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{proofPoints.map((proofPoint, index) => (
					<ProofCard
						key={proofPoint.title}
						proofPoint={proofPoint}
						delay={index * 0.1}
						isVisible={isVisible}
					/>
				))}
			</div>
		</section>
	);
}

function ProofCard({
	proofPoint,
	delay,
	isVisible,
}: {
	proofPoint: (typeof proofPoints)[number];
	delay: number;
	isVisible: boolean;
}) {
	return (
		<div
			className="group border border-border bg-card p-8 transition-colors hover:border-foreground/20"
			style={{
				opacity: isVisible ? 1 : 0,
				transform: isVisible ? "translateY(0)" : "translateY(20px)",
				transition: `opacity 0.6s ease-out ${delay}s, transform 0.6s ease-out ${delay}s`,
			}}
		>
			<div className="mb-6 h-12 w-12 overflow-hidden rounded-sm border border-border bg-secondary">
				<div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
					0{Math.floor(delay * 10) + 1}
				</div>
			</div>

			<h3 className="mb-4 text-xl font-medium text-foreground">
				{proofPoint.title}
			</h3>

			<p className="text-sm leading-relaxed text-muted-foreground">
				{proofPoint.body}
			</p>
		</div>
	);
}
