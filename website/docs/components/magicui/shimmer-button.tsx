"use client";

import { cn } from "@/lib/utils";
import type { CSSProperties, ReactNode } from "react";

interface ShimmerButtonProps {
	shimmerColor?: string;
	shimmerSize?: string;
	shimmerDuration?: string;
	background?: string;
	className?: string;
	children?: ReactNode;
	onClick?: () => void;
	type?: "button" | "submit" | "reset";
}

export default function ShimmerButton({
	shimmerColor = "#ffffff",
	shimmerSize = "0.05em",
	shimmerDuration = "3s",
	background = "rgba(10,10,10,1)",
	className,
	children,
	onClick,
	type = "button",
	...props
}: ShimmerButtonProps) {
	return (
		<button
			style={
				{
					"--spread": "90deg",
					"--shimmer-color": shimmerColor,
					"--speed": shimmerDuration,
					"--cut": shimmerSize,
					"--bg": background,
				} as CSSProperties
			}
			className={cn(
				"group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap px-3.5 py-1.5",
				"[background:var(--bg)]",
				// sharp corners to match site aesthetic
				"transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
				className,
			)}
			onClick={onClick}
			type={type}
			{...props}
		>
			{/* Animated shimmer layer */}
			<div
				className={cn(
					"-z-30 blur-[2px]",
					"absolute inset-0 overflow-visible [container-type:size]",
				)}
			>
				<div className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [mask:none]">
					<div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
				</div>
			</div>

			{children}

			{/* Inner glow */}
			<div className="absolute inset-0 size-full shadow-[inset_0_-4px_10px_#ffffff12] transition-all duration-300 group-hover:shadow-[inset_0_-4px_10px_#ffffff25]" />

			{/* Backdrop cutout — hides shimmer inside the button */}
			<div className="absolute -z-20 [background:var(--bg)] [inset:var(--cut)]" />
		</button>
	);
}
