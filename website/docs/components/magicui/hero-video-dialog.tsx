"use client";

import { AnimatePresence, motion } from "framer-motion";
import { XIcon } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface HeroVideoDialogProps {
	animationStyle?: "from-bottom" | "from-center" | "from-top" | "fade";
	videoSrc: string;
	thumbnailSrc: string;
	darkThumbnailSrc?: string;
	thumbnailAlt?: string;
	className?: string;
}

const variants = {
	"from-bottom": {
		initial: { y: "100%", opacity: 0 },
		animate: { y: 0, opacity: 1 },
		exit: { y: "100%", opacity: 0 },
	},
	"from-center": {
		initial: { scale: 0.5, opacity: 0 },
		animate: { scale: 1, opacity: 1 },
		exit: { scale: 0.5, opacity: 0 },
	},
	"from-top": {
		initial: { y: "-100%", opacity: 0 },
		animate: { y: 0, opacity: 1 },
		exit: { y: "-100%", opacity: 0 },
	},
	fade: {
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
	},
};

export default function HeroVideoDialog({
	animationStyle = "from-center",
	videoSrc,
	thumbnailSrc,
	darkThumbnailSrc,
	thumbnailAlt = "Video thumbnail",
	className,
}: HeroVideoDialogProps) {
	const [open, setOpen] = useState(false);
	const { resolvedTheme } = useTheme();
	const anim = variants[animationStyle];
	const isDark = resolvedTheme !== "light";
	const activeThumbnailSrc =
		isDark && darkThumbnailSrc ? darkThumbnailSrc : thumbnailSrc;

	return (
		<div className={cn("relative", className)}>
			{/* Thumbnail */}
			<button
				type="button"
				className="group relative block w-full cursor-pointer text-left"
				onClick={() => setOpen(true)}
			>
				<Image
					src={activeThumbnailSrc}
					alt={thumbnailAlt}
					width={1600}
					height={900}
					className="h-auto w-full border border-border transition-all duration-200 group-hover:brightness-75"
				/>
				{/* Play button */}
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex h-16 w-16 scale-90 items-center justify-center border border-white/30 bg-black/60 backdrop-blur-sm transition-all duration-200 group-hover:scale-100 group-hover:bg-black/80">
						<svg className="ml-1 h-6 w-6 fill-white" viewBox="0 0 24 24">
							<title>Play video</title>
							<path d="M8 5v14l11-7z" />
						</svg>
					</div>
				</div>
				{/* Label */}
				<div className="absolute bottom-4 left-4">
					<span className="border border-white/20 bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/80 backdrop-blur-sm">
						/ Watch demo
					</span>
				</div>
			</button>

			{/* Modal */}
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
					>
						<motion.div
							{...anim}
							transition={{ type: "spring", damping: 30, stiffness: 300 }}
							className="relative mx-4 aspect-video w-full max-w-5xl"
							onClick={(e) => e.stopPropagation()}
						>
							<button
								type="button"
								className="absolute -top-12 right-0 flex h-8 w-8 items-center justify-center border border-white/20 bg-black/60 text-white backdrop-blur-sm"
								onClick={() => setOpen(false)}
							>
								<XIcon className="h-4 w-4" />
							</button>
							<div className="size-full overflow-hidden border border-white/20">
								<iframe
									src={videoSrc}
									title="Bardo product demo video"
									className="size-full"
									allowFullScreen
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
								/>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
