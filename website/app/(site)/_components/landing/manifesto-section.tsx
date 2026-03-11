import LazyTextReveal from "@/components/lazy-text-reveal";

export default function ManifestoSection() {
	return (
		<section className="border-y border-border [contain-intrinsic-size:1200px] [content-visibility:auto]">
			<div className="mx-auto max-w-5xl">
				<LazyTextReveal
					text="Bardo keeps canon in local files you own, gives your agent continuity tools that stay auditable, and helps tabletop campaigns persist across sessions, agents, and machines without losing the plot."
					className="h-[160vh]"
				/>
			</div>
		</section>
	);
}
