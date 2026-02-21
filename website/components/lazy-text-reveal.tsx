"use client";

import dynamic from "next/dynamic";
import { useOnceInView } from "@/components/use-once-in-view";

const TextReveal = dynamic(
	() =>
		import("@/components/magicui/text-reveal").then((mod) => mod.TextReveal),
	{
		ssr: false,
	},
);

export default function LazyTextReveal({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("520px 0px");

	return (
		<div ref={ref}>
			{isInView ? (
				<TextReveal text={text} className={className} />
			) : (
				<div className={className ?? "h-[160vh]"} aria-hidden />
			)}
		</div>
	);
}
