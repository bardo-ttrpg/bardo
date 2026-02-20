"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

interface NumberTickerProps {
	value: number;
	direction?: "up" | "down";
	className?: string;
	delay?: number;
	decimalPlaces?: number;
	prefix?: string;
	suffix?: string;
}

const NumberTicker = dynamic(
	() => import("@/components/magicui/number-ticker"),
	{
		ssr: false,
	},
);

export default function LazyNumberTicker({
	value,
	direction = "up",
	className,
	delay = 0,
	decimalPlaces = 0,
	prefix = "",
	suffix = "",
}: NumberTickerProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const staticValue =
		prefix +
		Intl.NumberFormat("en-US", {
			minimumFractionDigits: decimalPlaces,
			maximumFractionDigits: decimalPlaces,
		}).format(value) +
		suffix;

	if (!mounted) {
		return (
			<span className={className} suppressHydrationWarning>
				{staticValue}
			</span>
		);
	}

	return (
		<NumberTicker
			value={value}
			direction={direction}
			className={className}
			delay={delay}
			decimalPlaces={decimalPlaces}
			prefix={prefix}
			suffix={suffix}
		/>
	);
}
