"use client";

const logos = [
	{ name: "Claude Code", text: "Claude Code" },
	{ name: "Cursor", text: "Cursor" },
	{ name: "OpenCode", text: "OpenCode" },
	{ name: "Codex CLI", text: "Codex CLI" },
	{ name: "Cline", text: "Cline" },
	{ name: "Local Bridge", text: "Local Bridge" },
	{ name: "Remote MCP", text: "Remote MCP" },
	{ name: "Campaign Truth", text: "Campaign Truth" },
	{ name: "Markdown Canon", text: "Markdown Canon" },
	{ name: "Bridge Approval", text: "Bridge Approval" },
];

const logoLoops = ["first", "second", "third"] as const;

export default function LogoCarousel() {
	return (
		<section className="border-b border-border py-12">
			<div className="relative overflow-hidden">
				<div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
				<div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />

				<div
					className="flex items-center gap-16 hover:[animation-play-state:paused]"
					style={{
						animation: "scroll-left 40s linear infinite",
						width: "max-content",
					}}
				>
					{logoLoops.flatMap((loop) =>
						logos.map((logo) => (
							<div
								key={`${loop}-${logo.name}`}
								className="flex shrink-0 items-center"
							>
								<span className="whitespace-nowrap text-xl font-medium tracking-tight text-muted-foreground/60 transition-colors hover:text-muted-foreground md:text-2xl">
									{logo.text}
								</span>
							</div>
						)),
					)}
				</div>
			</div>
		</section>
	);
}
