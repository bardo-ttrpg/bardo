"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?#@$%";
const FRAME_MS = 45;
const STAGGER_MS = 28;
const SCRAMBLE_FRAMES = 7;

function randomChar() {
	return CHARS[Math.floor(Math.random() * CHARS.length)];
}

type StaggerFrom = "left" | "right" | "center";

interface ScrambleTextProps {
	/** The final text to reveal */
	text: string;
	className?: string;
	charClassName?: string;
	/** Stagger direction (default: "center") */
	from?: StaggerFrom;
	/** If provided, controls playback externally; if omitted, runs once on mount */
	active?: boolean;
}

export default function ScrambleText({
	text,
	className,
	charClassName,
	from = "center",
	active,
}: ScrambleTextProps) {
	const chars = useMemo(() => text.split(""), [text]);
	const [display, setDisplay] = useState<string[]>(chars.slice());
	// Internal trigger — fires once on mount if no external `active` prop
	const [triggered, setTriggered] = useState(false);
	const hasRunOnMount = useRef(false);

	// Fire once on mount when no external active prop is supplied
	useEffect(() => {
		if (active !== undefined) return;
		if (hasRunOnMount.current) return;
		hasRunOnMount.current = true;
		// Tiny delay so the element is painted before animation starts
		const id = setTimeout(() => setTriggered((v) => !v), 120);
		return () => clearTimeout(id);
	}, [active]);

	const currentActive = active ?? triggered;

	useEffect(() => {
		if (!currentActive) {
			setDisplay(chars.slice());
			return;
		}

		// Build stagger order
		const indices = chars.map((_, i) => i);
		if (from === "center") {
			const mid = (chars.length - 1) / 2;
			indices.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
		} else if (from === "right") {
			indices.reverse();
		}
		// "left" = natural L→R order

		const cleanups: Array<() => void> = [];

		indices.forEach((charIdx, order) => {
			if (chars[charIdx] === " ") return;

			const timeoutId = setTimeout(() => {
				let frame = 0;
				const intervalId = setInterval(() => {
					frame++;
					if (frame >= SCRAMBLE_FRAMES) {
						clearInterval(intervalId);
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
				}, FRAME_MS);
				cleanups.push(() => clearInterval(intervalId));
			}, order * STAGGER_MS);

			cleanups.push(() => clearTimeout(timeoutId));
		});

		return () => {
			cleanups.forEach((fn) => {
				fn();
			});
		};
	}, [chars, currentActive, from]);

	return (
		<span className={className}>
			<span className="sr-only">{text}</span>
			{display.map((ch, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: char index is stable for a fixed string
					key={i}
					aria-hidden="true"
					className={`inline-block ${charClassName ?? ""}`}
				>
					{ch === " " ? "\u00a0" : ch}
				</span>
			))}
		</span>
	);
}
