"use client";

const logos = [
	{ name: "Miro", text: "miro" },
	{ name: "Rakuten", text: "Rakuten" },
	{ name: "Duolingo", text: "duolingo" },
	{ name: "WHOOP", text: "WHOOP" },
	{ name: "Vanta", text: "Vanta" },
	{ name: "Cisco", text: "CISCO" },
	{ name: "Virgin Atlantic", text: "virgin atlantic" },
	{ name: "Harvey", text: "Harvey" },
	{ name: "Sierra", text: "Sierra" },
	{ name: "Ramp", text: "Ramp" },
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
