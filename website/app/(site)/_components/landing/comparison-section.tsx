import SectionLabel from "@/components/section-label";
import { withBardoItems, withoutBardoItems } from "./data";

export default function ComparisonSection() {
	return (
		<section className="mt-16 border border-border [contain-intrinsic-size:760px] [content-visibility:auto]">
			<div className="grid grid-cols-1 sm:grid-cols-2">
				<div className="border-b border-border p-8 sm:border-b-0 sm:border-r">
					<SectionLabel>Without Bardo</SectionLabel>
					<ul className="space-y-3">
						{withoutBardoItems.map((item) => (
							<li key={item} className="flex items-start gap-3">
								<span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground/60">
									✕
								</span>
								<span className="text-sm text-muted-foreground">{item}</span>
							</li>
						))}
					</ul>
				</div>

				<div className="p-8">
					<SectionLabel>With Bardo</SectionLabel>
					<ul className="space-y-3">
						{withBardoItems.map((item) => (
							<li key={item} className="flex items-start gap-3">
								<span className="mt-0.5 shrink-0 font-mono text-[11px] text-green-700 dark:text-green-400/70">
									✓
								</span>
								<span className="text-sm text-foreground">{item}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	);
}
