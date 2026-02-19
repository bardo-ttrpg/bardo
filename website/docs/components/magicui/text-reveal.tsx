"use client";

import { cn } from "@/lib/utils";
import {
	motion,
	type MotionValue,
	useScroll,
	useTransform,
} from "framer-motion";
import { type FC, type ReactNode, useRef } from "react";

interface TextRevealProps {
	text: string;
	className?: string;
}

export const TextReveal: FC<TextRevealProps> = ({ text, className }) => {
	const targetRef = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: targetRef });
	const words = text.split(" ");

	return (
		<div ref={targetRef} className={cn("relative z-0 h-[200vh]", className)}>
			<div className="sticky top-0 mx-auto flex h-[50%] items-center px-4 py-20 sm:px-6">
				<p className="flex flex-wrap gap-x-2 text-2xl font-bold leading-snug tracking-tight sm:text-3xl lg:text-4xl">
					{words.map((word, i) => {
						const start = i / words.length;
						const end = start + 1 / words.length;
						return (
							<Word key={i} progress={scrollYProgress} range={[start, end]}>
								{word}
							</Word>
						);
					})}
				</p>
			</div>
		</div>
	);
};

interface WordProps {
	children: ReactNode;
	progress: MotionValue<number>;
	range: [number, number];
}

const Word: FC<WordProps> = ({ children, progress, range }) => {
	const opacity = useTransform(progress, range, [0.15, 1]);
	return (
		<span className="relative">
			<span className="absolute opacity-15">{children}</span>
			<motion.span style={{ opacity }}>{children}</motion.span>
		</span>
	);
};
