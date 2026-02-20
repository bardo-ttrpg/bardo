import LazyDottedMap from "@/components/lazy-dotted-map";
import SectionLabel from "@/components/section-label";
import { worldMarkers } from "./data";

export default function WorldMapSection() {
	return (
		<section className="overflow-hidden border-b border-border [contain-intrinsic-size:780px] [content-visibility:auto]">
			<div className="mx-auto max-w-7xl px-4 sm:px-6">
				<div className="border-b border-border py-10">
					<SectionLabel>Your world. Any world.</SectionLabel>
					<p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
						Bardo is open standard and agent-agnostic. Whether you're running a
						gritty noir campaign in Chicago or a high-fantasy epic in an
						entirely invented universe, the MCP protocol connects your world to
						any AI stack, anywhere.
					</p>
				</div>
			</div>
			<LazyDottedMap markers={worldMarkers} />
		</section>
	);
}
