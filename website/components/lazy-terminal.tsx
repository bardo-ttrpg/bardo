"use client";

import dynamic from "next/dynamic";
import { useOnceInView } from "./use-once-in-view";

const BardoTerminal = dynamic(() => import("@/components/bardo-terminal"), {
	ssr: false,
});

export default function LazyTerminal() {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("420px 0px");

	return (
		<div ref={ref} className="min-h-[520px]">
			{isInView ? (
				<BardoTerminal />
			) : (
				<div
					className="h-[520px] w-full animate-pulse border border-border bg-linear-to-br from-muted/5 via-muted/10 to-muted/5"
					aria-hidden
				/>
			)}
		</div>
	);
}
