"use client";

import dynamic from "next/dynamic";
import { useOnceInView } from "./use-once-in-view";

const BardoTerminal = dynamic(() => import("@/components/bardo-terminal"), {
	ssr: false,
});

export default function LazyTerminal() {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("180px 0px");

	return (
		<div ref={ref} className="min-h-[520px]">
			{isInView ? (
				<BardoTerminal />
			) : (
				<div
					className="h-[520px] w-full animate-pulse border border-border bg-muted/10"
					aria-hidden
				/>
			)}
		</div>
	);
}
