import LazyTextReveal from "@/components/lazy-text-reveal";

export default function ManifestoSection() {
	return (
		<section className="border-y border-border [contain-intrinsic-size:1200px] [content-visibility:auto]">
			<div className="mx-auto max-w-5xl">
				<LazyTextReveal
					text="Bardo gives your AI agent the memory, the tools, and the discipline to run tabletop campaigns that persist across sessions, agents, and machines — without losing a single plot thread."
					className="h-[160vh]"
				/>
			</div>
		</section>
	);
}
