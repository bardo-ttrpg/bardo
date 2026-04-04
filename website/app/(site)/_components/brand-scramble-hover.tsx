"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SCRAMBLE_SYMBOLS = "!@#$%^&*+-=<>?/[]{}|~";

export function BrandScrambleHover({
	text,
	className,
	scrambleSpeed = 85,
}: {
	text: string;
	className?: string;
	scrambleSpeed?: number;
}) {
	const [displayText, setDisplayText] = useState(text);
	const animationFrameRef = useRef<number | null>(null);
	const hoverCapableRef = useRef(false);
	const isAnimatingRef = useRef(false);

	useEffect(() => {
		const mediaQuery = window.matchMedia(
			"(min-width: 1024px) and (hover: hover) and (pointer: fine)",
		);
		const sync = () => {
			hoverCapableRef.current = mediaQuery.matches;
			if (!mediaQuery.matches) {
				setDisplayText(text);
			}
		};

		sync();
		mediaQuery.addEventListener("change", sync);

		return () => {
			mediaQuery.removeEventListener("change", sync);
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [text]);

	function stopAnimation() {
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
			animationFrameRef.current = null;
		}
		isAnimatingRef.current = false;
	}

	function startAnimation() {
		if (!hoverCapableRef.current || isAnimatingRef.current) {
			return;
		}

		stopAnimation();
		isAnimatingRef.current = true;

		let frame = 0;
		let lastUpdateTime = 0;
		const centerIndex = (text.length - 1) / 2;
		const revealSpan = centerIndex + 1;
		const maxFrames = Math.max(text.length + 8, 18);

		const step = (timestamp: number) => {
			if (timestamp - lastUpdateTime < scrambleSpeed) {
				animationFrameRef.current = requestAnimationFrame(step);
				return;
			}

			lastUpdateTime = timestamp;
			frame += 1;
			const revealDistance = (frame / maxFrames) * revealSpan;

			const nextText = text
				.split("")
				.map((character, index) => {
					if (Math.abs(index - centerIndex) <= revealDistance) {
						return character;
					}

					return SCRAMBLE_SYMBOLS[
						Math.floor(Math.random() * SCRAMBLE_SYMBOLS.length)
					];
				})
				.join("");

			setDisplayText(nextText);

			if (frame < maxFrames) {
				animationFrameRef.current = requestAnimationFrame(step);
				return;
			}

			setDisplayText(text);
			animationFrameRef.current = null;
			isAnimatingRef.current = false;
		};

		setDisplayText(
			text
				.split("")
				.map(
					() =>
						SCRAMBLE_SYMBOLS[
							Math.floor(Math.random() * SCRAMBLE_SYMBOLS.length)
						],
				)
				.join(""),
		);
		animationFrameRef.current = requestAnimationFrame(step);
	}

	return (
		<span
			aria-hidden="true"
			className={cn("relative inline-grid whitespace-nowrap leading-none", className)}
			onPointerEnter={startAnimation}
		>
			<span className="invisible col-start-1 row-start-1 select-none">
				{text}
			</span>
			<span className="col-start-1 row-start-1">{displayText}</span>
		</span>
	);
}
