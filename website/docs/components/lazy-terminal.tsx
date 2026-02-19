"use client";

import { useInView } from "framer-motion";
import { useRef } from "react";
import BardoTerminal from "@/components/bardo-terminal";

export default function LazyTerminal() {
	const ref = useRef<HTMLDivElement>(null);
	// Trigger once when the container is 80px into the viewport
	const isInView = useInView(ref, { once: true, margin: "-80px" });

	return (
		<div ref={ref} className="min-h-[520px]">
			{isInView && <BardoTerminal />}
		</div>
	);
}
