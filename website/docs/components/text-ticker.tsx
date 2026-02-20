"use client";

import { motion, useAnimationFrame, useMotionValue } from "motion/react";
import { useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?#@";
const SCRAMBLE_MS = 38;
const SCRAMBLE_ROUNDS = 7;

function randomChar() {
	return CHARS[Math.floor(Math.random() * CHARS.length)];
}

/** A single ticker item that scrambles its text on hover */
function TickerItem({ text, className }: { text: string; className?: string }) {
	const chars = text.split("");
	const [display, setDisplay] = useState<string[]>(chars.slice());
	const cleanupRef = useRef<Array<() => void>>([]);

	function scramble() {
		// Cancel any in-flight animation
		cleanupRef.current.forEach((fn) => {
			fn();
		});
		cleanupRef.current = [];

		const indices = chars.map((_, i) => i).filter((i) => chars[i] !== " ");

		indices.forEach((charIdx) => {
			let frame = 0;
			const iv = setInterval(() => {
				frame++;
				if (frame >= SCRAMBLE_ROUNDS) {
					clearInterval(iv);
					setDisplay((prev) => {
						const next = [...prev];
						next[charIdx] = chars[charIdx] ?? "";
						return next;
					});
					return;
				}
				setDisplay((prev) => {
					const next = [...prev];
					next[charIdx] = randomChar() ?? "";
					return next;
				});
			}, SCRAMBLE_MS);
			cleanupRef.current.push(() => clearInterval(iv));
		});
	}

	function reset() {
		cleanupRef.current.forEach((fn) => {
			fn();
		});
		cleanupRef.current = [];
		setDisplay(chars.slice());
	}

	return (
		<button
			type="button"
			aria-label={text}
			className={`cursor-default select-none border-0 bg-transparent p-0 text-left text-inherit ${className ?? ""}`}
			onMouseEnter={scramble}
			onMouseLeave={reset}
			onFocus={scramble}
			onBlur={reset}
		>
			{display.map((ch, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: stable fixed-length string
					key={i}
					aria-hidden
					className="inline-block"
				>
					{ch === " " ? "\u00a0" : ch}
				</span>
			))}
		</button>
	);
}

interface TextTickerProps {
	items: string[];
	/** Normal scroll speed in px/frame (~60 fps) */
	baseSpeed?: number;
	/** Speed multiplier when pointer is over the strip */
	hoverMultiplier?: number;
	className?: string;
	itemClassName?: string;
	separator?: string;
}

export default function TextTicker({
	items,
	baseSpeed = 0.55,
	hoverMultiplier = 4,
	className,
	itemClassName,
	separator = "·",
}: TextTickerProps) {
	const x = useMotionValue(0);
	const speedRef = useRef(baseSpeed);
	const wrapRef = useRef<HTMLDivElement>(null);

	// Duplicate items 3× for a seamless loop regardless of container width
	const loopItems = [...items, ...items, ...items];

	useAnimationFrame(() => {
		if (!wrapRef.current) return;
		// Width of one copy of the items (1/3 of total)
		const oneSet = wrapRef.current.scrollWidth / 3;
		const next = x.get() - speedRef.current;
		// Reset when one full copy has scrolled past
		x.set(next <= -oneSet ? next + oneSet : next);
	});

	return (
		<div className={`overflow-hidden ${className ?? ""}`}>
			<motion.div
				ref={wrapRef}
				className="flex items-center"
				style={{ x, willChange: "transform" }}
				onPointerEnter={() => {
					speedRef.current = baseSpeed * hoverMultiplier;
				}}
				onPointerLeave={() => {
					speedRef.current = baseSpeed;
				}}
			>
				{loopItems.map((item, i) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: deliberate duplication for seamless loop
						key={i}
						className="flex shrink-0 items-center"
					>
						<TickerItem
							text={item}
							className={`font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground ${itemClassName ?? ""}`}
						/>
						<span
							aria-hidden
							className="mx-5 font-mono text-[11px] text-foreground/20"
						>
							{separator}
						</span>
					</span>
				))}
			</motion.div>
		</div>
	);
}
