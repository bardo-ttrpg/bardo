"use client";

import {
	domAnimation,
	LazyMotion,
	type MotionValue,
	m,
	useReducedMotion,
	useScroll,
	useTransform,
} from "framer-motion";
import { type FC, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

interface TextRevealProps {
	text: string;
	className?: string;
}

export const TextReveal: FC<TextRevealProps> = ({ text, className }) => {
	const targetRef = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: targetRef });
	const prefersReducedMotion = useReducedMotion() ?? false;
	const words = text.split(" ");

	return (
		<LazyMotion features={domAnimation}>
			<div ref={targetRef} className={cn("relative z-0 h-[200vh]", className)}>
				<div className="sticky top-0 mx-auto flex h-[50%] items-center px-4 py-20 sm:px-6">
					<p className="flex flex-wrap gap-x-2 text-2xl font-bold leading-snug tracking-tight sm:text-3xl lg:text-4xl">
						{words.map((word, i) => {
							const start = i / words.length;
							const end = start + 1 / words.length;
							return (
								<Word
									key={`${word}-${start.toFixed(4)}`}
									progress={scrollYProgress}
									prefersReducedMotion={prefersReducedMotion}
									range={[start, end]}
								>
									{word}
								</Word>
							);
						})}
					</p>
				</div>
			</div>
		</LazyMotion>
	);
};

interface WordProps {
	children: ReactNode;
	progress: MotionValue<number>;
	prefersReducedMotion: boolean;
	range: [number, number];
}

const Word: FC<WordProps> = ({
	children,
	progress,
	prefersReducedMotion,
	range,
}) => {
	const opacity = useTransform(
		progress,
		range,
		prefersReducedMotion ? [1, 1] : [0.15, 1],
	);
	return (
		<span className="relative">
			<span className="absolute opacity-15">{children}</span>
			<m.span style={{ opacity }}>{children}</m.span>
		</span>
	);
};
