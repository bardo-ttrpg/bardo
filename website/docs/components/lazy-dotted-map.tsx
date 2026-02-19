"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/magicui/dotted-map";
import { useOnceInView } from "./use-once-in-view";

// next/dynamic with ssr:false must live in a Client Component
const DottedMapInner = dynamic(
	() => import("@/components/magicui/dotted-map"),
	{
		loading: () => (
			<div className="h-64 w-full animate-pulse bg-muted/10" aria-hidden />
		),
		ssr: false,
	},
);

export default function LazyDottedMap({ markers }: { markers?: MapMarker[] }) {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("220px 0px");

	return (
		<div ref={ref} className="min-h-[320px]">
			{isInView ? (
				<DottedMapInner markers={markers} />
			) : (
				<div
					className="h-[320px] w-full animate-pulse bg-muted/10"
					aria-hidden
				/>
			)}
		</div>
	);
}
