"use client";

import { type MotionProps, motion } from "framer-motion";
import type React from "react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedSpanProps extends MotionProps {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}

export const AnimatedSpan = ({
	children,
	delay = 0,
	className,
	...props
}: AnimatedSpanProps) => (
	<motion.div
		initial={{ opacity: 0, y: -4 }}
		animate={{ opacity: 1, y: 0 }}
		transition={{ duration: 0.25, delay }}
		className={cn("grid text-sm font-normal tracking-tight", className)}
		{...props}
	>
		{children}
	</motion.div>
);

interface TypingAnimationProps extends MotionProps {
	children: string;
	className?: string;
	duration?: number;
	delay?: number;
}

export const TypingAnimation = ({
	children,
	className,
	duration = 40,
	delay = 0,
	...props
}: TypingAnimationProps) => {
	if (typeof children !== "string") {
		throw new Error("TypingAnimation children must be a string");
	}

	const [displayedText, setDisplayedText] = useState("");
	const [started, setStarted] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setStarted(true), delay);
		return () => clearTimeout(t);
	}, [delay]);

	useEffect(() => {
		if (!started) return;
		let i = 0;
		const id = setInterval(() => {
			if (i < children.length) {
				setDisplayedText(children.substring(0, i + 1));
				i++;
			} else {
				clearInterval(id);
			}
		}, duration);
		return () => clearInterval(id);
	}, [children, duration, started]);

	return (
		<motion.span
			className={cn("text-sm font-normal tracking-tight", className)}
			{...props}
		>
			{displayedText}
		</motion.span>
	);
};

interface TerminalProps {
	children: React.ReactNode;
	className?: string;
}

export const Terminal = ({ children, className }: TerminalProps) => {
	return (
		<div
			className={cn(
				"z-0 h-full w-full border border-border bg-background",
				className,
			)}
		>
			{/* Title bar */}
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<div className="flex flex-row gap-x-1.5">
					<div className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
					<div className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
					<div className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
				</div>
				<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					bardo — mcp session
				</span>
				<div className="w-12" />
			</div>
			<pre className="p-5">
				<code className="grid gap-y-1 overflow-auto font-mono text-xs">
					{children}
				</code>
			</pre>
		</div>
	);
};
