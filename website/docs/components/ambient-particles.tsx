"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { shouldEnableAmbientEffects } from "@/lib/performance";

const Particles = dynamic(() => import("@/components/magicui/particles"), {
	ssr: false,
});

export default function AmbientParticles() {
	const [enabled, setEnabled] = useState(false);

	useEffect(() => {
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const connection = navigator as Navigator & {
			connection?: { saveData?: boolean };
		};
		const saveData = Boolean(connection.connection?.saveData);
		const viewportWidth = window.innerWidth;

		if (
			!shouldEnableAmbientEffects({
				prefersReducedMotion,
				saveData,
				viewportWidth,
			})
		) {
			return;
		}

		const load = () => setEnabled(true);
		const win = window as Window & {
			requestIdleCallback?: (
				callback: IdleRequestCallback,
				options?: IdleRequestOptions,
			) => number;
			cancelIdleCallback?: (handle: number) => void;
		};

		if (typeof win.requestIdleCallback === "function") {
			const idleId = win.requestIdleCallback(load, { timeout: 1200 });
			return () => {
				if (typeof win.cancelIdleCallback === "function") {
					win.cancelIdleCallback(idleId);
				}
			};
		}

		const timeoutId = window.setTimeout(load, 250);
		return () => {
			window.clearTimeout(timeoutId);
		};
	}, []);

	if (!enabled) return null;

	return (
		<Particles
			className="fixed inset-0 z-0 pointer-events-none"
			quantity={80}
			staticity={40}
			ease={60}
			size={0.28}
			color="#ffffff"
		/>
	);
}
