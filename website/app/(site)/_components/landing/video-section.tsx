import LazyHeroVideoDialog from "@/components/lazy-hero-video-dialog";
import SectionLabel from "@/components/section-label";

export default function VideoSection() {
	return (
		<section className="mt-16">
			<div className="mb-6">
				<SectionLabel>Demo</SectionLabel>
				<h2 className="text-xl font-semibold tracking-tight text-foreground">
					Watch a full campaign session
				</h2>
			</div>
			<LazyHeroVideoDialog
				animationStyle="from-center"
				videoSrc="https://www.youtube.com/embed/qh3NGpYRG3I?si=4rb-zSdDkVK9qxxb"
				thumbnailSrc="https://img.youtube.com/vi/qh3NGpYRG3I/maxresdefault.jpg"
				darkThumbnailSrc="https://img.youtube.com/vi/qh3NGpYRG3I/maxresdefault.jpg"
				thumbnailAlt="Bardo demo video"
			/>
		</section>
	);
}
