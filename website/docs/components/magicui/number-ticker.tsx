"use client";

import { cn } from "@/lib/utils";
import { useInView, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";

interface NumberTickerProps {
	value: number;
	direction?: "up" | "down";
	className?: string;
	delay?: number;
	decimalPlaces?: number;
	prefix?: string;
	suffix?: string;
}

export default function NumberTicker({
	value,
	direction = "up",
	delay = 0,
	className,
	decimalPlaces = 0,
	prefix = "",
	suffix = "",
}: NumberTickerProps) {
	const ref = useRef<HTMLSpanElement>(null);
	const motionValue = useMotionValue(direction === "down" ? value : 0);
	const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
	const isInView = useInView(ref, { once: true, margin: "0px" });

	useEffect(() => {
		if (isInView) {
			setTimeout(() => {
				motionValue.set(direction === "down" ? 0 : value);
			}, delay * 1000);
		}
	}, [motionValue, isInView, delay, value, direction]);

	useEffect(
		() =>
			springValue.on("change", (latest) => {
				if (ref.current) {
					ref.current.textContent =
						prefix +
						Intl.NumberFormat("en-US", {
							minimumFractionDigits: decimalPlaces,
							maximumFractionDigits: decimalPlaces,
						}).format(Number(latest.toFixed(decimalPlaces))) +
						suffix;
				}
			}),
		[springValue, decimalPlaces, prefix, suffix],
	);

	return (
		<span
			ref={ref}
			className={cn(
				"inline-block tabular-nums tracking-tight text-foreground",
				className,
			)}
		/>
	);
}
