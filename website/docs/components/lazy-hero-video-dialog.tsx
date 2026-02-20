"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { useOnceInView } from "./use-once-in-view";

interface HeroVideoDialogProps {
	animationStyle?: "from-bottom" | "from-center" | "from-top" | "fade";
	videoSrc: string;
	thumbnailSrc: string;
	darkThumbnailSrc?: string;
	thumbnailAlt?: string;
	className?: string;
}

const HeroVideoDialog = dynamic(
	() => import("@/components/magicui/hero-video-dialog"),
	{
		ssr: false,
	},
);

export default function LazyHeroVideoDialog(props: HeroVideoDialogProps) {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("420px 0px");

	return (
		<div ref={ref} className={cn("relative", props.className)}>
			{isInView ? (
				<HeroVideoDialog {...props} />
			) : (
				<div
					className="aspect-video w-full border border-border bg-linear-to-br from-muted/5 via-muted/10 to-muted/5"
					aria-hidden
				/>
			)}
		</div>
	);
}
