import CrosshairMarker from "@/components/crosshair-marker";
import SectionLabel from "@/components/section-label";
import { agents, features, workflow } from "./data";

export default function CompatibilitySection() {
	return (
		<section className="relative mt-16 border border-border [contain-intrinsic-size:1600px] [content-visibility:auto]">
			<CrosshairMarker className="-left-[5px] -top-[8px]" />
			<CrosshairMarker className="-right-[5px] -top-[8px]" />
			<CrosshairMarker className="-bottom-[8px] -left-[5px]" />
			<CrosshairMarker className="-right-[5px] -bottom-[8px]" />
			<CrosshairMarker className="-top-[8px] left-[calc(66.666%-5px)] hidden lg:block" />
			<CrosshairMarker className="-bottom-[8px] left-[calc(66.666%-5px)] hidden lg:block" />
			<CrosshairMarker className="-left-[5px] top-[calc(50%-8px)] hidden lg:block" />
			<CrosshairMarker className="-right-[5px] top-[calc(50%-8px)] hidden lg:block" />

			<div className="grid grid-cols-1 lg:grid-cols-3">
				<div className="border-b border-border p-8 lg:col-span-2 lg:border-r">
					<SectionLabel>Compatible Agents</SectionLabel>
					<h2 className="mb-6 text-lg font-semibold tracking-tight">
						Works with your current stack
					</h2>
					<ul className="grid grid-cols-2 gap-x-8 gap-y-2.5">
						{agents.map((agent) => (
							<li key={agent} className="flex items-center gap-2.5">
								<span className="h-px w-3 shrink-0 bg-muted-foreground/40" />
								<span className="text-sm text-muted-foreground">{agent}</span>
							</li>
						))}
					</ul>
				</div>

				<div className="border-b border-border p-8">
					<SectionLabel>Why Bardo</SectionLabel>
					<h2 className="mb-4 text-lg font-semibold tracking-tight">
						Repeatable.
						<br />
						Coherent.
						<br />
						System-agnostic.
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						Explicit state handling and predictable narrative synchronization
						through markdown-first tooling. No more ad-hoc prompting. No more
						lost campaigns.
					</p>
				</div>
			</div>

			<div>
				<div className="border-b border-border px-8 py-4">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ What Bardo brings to every session
					</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
					{features.map(({ icon: Icon, label, desc }, i) => (
						<div
							key={label}
							className={[
								"p-8",
								i < 5 ? "border-b border-border" : "",
								i % 2 === 0 ? "sm:border-r" : "",
								i >= 4 ? "sm:border-b-0" : "",
								i % 3 !== 2 ? "lg:border-r" : "lg:border-r-0",
								i >= 3 ? "lg:border-b-0" : "",
							]
								.filter(Boolean)
								.join(" ")}
						>
							<Icon className="mb-4 h-5 w-5 text-muted-foreground/60" />
							<p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
								{String(i + 1).padStart(2, "0")}
							</p>
							<h3 className="mb-2 text-sm font-semibold text-foreground">
								{label}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{desc}
							</p>
						</div>
					))}
				</div>
			</div>

			<div>
				<div className="border-b border-border px-8 py-4">
					<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
						/ Getting started — four steps
					</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
					{workflow.map(({ n, text }, i) => (
						<div
							key={n}
							className={[
								"p-8",
								i < 3 ? "border-b border-border" : "",
								i % 2 === 0 ? "sm:border-r" : "",
								i >= 2 ? "sm:border-b-0" : "",
								i < 3 ? "lg:border-r" : "",
								"lg:border-b-0",
							]
								.filter(Boolean)
								.join(" ")}
						>
							<span className="mb-3 block font-mono text-[11px] text-muted-foreground/60">
								{n}
							</span>
							<p className="text-sm leading-relaxed text-foreground">{text}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
