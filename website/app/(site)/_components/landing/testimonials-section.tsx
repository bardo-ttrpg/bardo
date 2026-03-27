"use client";

import { useEffect, useRef, useState } from "react";

const testimonials = [
	{
		quote:
			"At Wonderful, Codex CLI has completely replaced every other agentic harness for our core technology and architecture work requiring deep reasoning and understanding.",
		name: "Daniel Sikorskiy",
		title: "Chief Architect",
		company: "Wonderful",
	},
	{
		quote:
			"At Harvey, Codex transformed how we build by cutting early iteration time by 30-50%, freeing engineers to focus on system design and high-leverage decisions.",
		name: "Joey Wang",
		title: "Mobile Lead",
		company: "Harvey",
	},
	{
		quote:
			"With Codex, we ship in a weekend what previously took a quarter. It's become our go-to for projects we wouldn't have otherwise been able to take on.",
		name: "Tess Rosania",
		title: "Software Engineer",
		company: "Sierra",
	},
	{
		quote:
			"The recent Codex releases have been a step change. Codex PR reviews catch bugs our team would have missed, and we ship with more confidence because of it. Now we're pulling the CLI and desktop app into more of our workflows—each release raises the bar.",
		name: "Austin Ray",
		title: "AI Dev X Team Lead",
		company: "Ramp",
	},
	{
		quote:
			"Codex performed best in our backend Python code-review benchmark. It was the only one to catch tricky backward compatibility issues and consistently found the hard bugs that other bots missed.",
		name: "Aaron Wang",
		title: "Senior Software Engineer",
		company: "Duolingo",
	},
	{
		quote:
			"I needed to update another team's codebase for a release. Codex handled the refactor and test generation, delivering fully tested code I handed back fast—keeping the feature on schedule without added risk.",
		name: "Tres Wong-Godfrey",
		title: "Tech Lead",
		company: "Cisco Meraki",
	},
];

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
				What builders are saying
			</h2>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{testimonials.map((testimonial, index) => (
					<TestimonialCard
						key={testimonial.name}
						testimonial={testimonial}
						delay={index * 0.1}
						isVisible={isVisible}
					/>
				))}
			</div>
		</section>
	);
}

function TestimonialCard({
	testimonial,
	delay,
	isVisible,
}: {
	testimonial: (typeof testimonials)[number];
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
			<div className="mb-6 h-12 w-12 overflow-hidden rounded-sm bg-secondary">
				<div className="flex h-full w-full items-center justify-center text-lg font-medium text-muted-foreground">
					{testimonial.name
						.split(" ")
						.map((name) => name[0])
						.join("")}
				</div>
			</div>

			<blockquote className="mb-6 text-sm leading-relaxed text-foreground">
				&ldquo;{testimonial.quote}&rdquo;
			</blockquote>

			<cite className="not-italic">
				<span className="text-sm text-muted-foreground">
					{testimonial.name}, {testimonial.title}, {testimonial.company}
				</span>
			</cite>
		</div>
	);
}
