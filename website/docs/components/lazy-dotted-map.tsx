"use client";

import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/magicui/dotted-map";

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
	return <DottedMapInner markers={markers} />;
}
