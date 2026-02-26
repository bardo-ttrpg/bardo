"use client";

import { domAnimation, LazyMotion, type MotionProps, m } from "framer-motion";
import type React from "react";
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
	<LazyMotion features={domAnimation}>
		<m.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25, delay }}
			className={cn("grid text-sm font-normal tracking-tight", className)}
			{...props}
		>
			{children}
		</m.div>
	</LazyMotion>
);

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
