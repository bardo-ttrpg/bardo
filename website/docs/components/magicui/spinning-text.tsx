"use client";

import { cn } from "@/lib/utils";
import { motion, type MotionProps, type Transition, type Variants } from "framer-motion";

interface SpinningTextProps extends MotionProps {
	children: string;
	duration?: number;
	className?: string;
	reverse?: boolean;
	fontSize?: number;
	radius?: number;
	transition?: Transition;
}

const BASE_TRANSITION: Transition = { repeat: Infinity, ease: "linear" };

export default function SpinningText({
	children,
	duration = 12,
	className,
	reverse = false,
	fontSize = 0.75,
	radius = 4,
	transition,
	...props
}: SpinningTextProps) {
	if (typeof children !== "string") {
		throw new Error("SpinningText: children must be a string");
	}

	const letters = children.split("");
	const total = letters.length;
	const anglePerLetter = 360 / total;

	const containerVariants: Variants = {
		visible: { rotate: reverse ? -360 : 360 },
	};

	return (
		<motion.div
			className={cn("relative", className)}
			style={{ width: `${radius * 2}em`, height: `${radius * 2}em` }}
			initial="hidden"
			animate="visible"
			variants={containerVariants}
			transition={{ ...BASE_TRANSITION, duration, ...transition }}
			{...props}
		>
			{letters.map((letter, i) => (
				<span
					key={`${i}-${letter}`}
					style={{
						position: "absolute",
						top: "50%",
						left: "50%",
						fontSize: `${fontSize}em`,
						transform: `rotate(${anglePerLetter * i}deg) translate(0, -${radius}em)`,
						transformOrigin: "center bottom",
						lineHeight: 1,
					}}
				>
					{letter === " " ? "\u00A0" : letter}
				</span>
			))}
		</motion.div>
	);
}
