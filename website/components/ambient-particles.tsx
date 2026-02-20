"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { shouldEnableAmbientEffects } from "@/lib/performance";

const Particles = dynamic(() => import("@/components/magicui/particles"), {
	ssr: false,
});

export default function AmbientParticles() {
	const [enabled, setEnabled] = useState(false);
	const { resolvedTheme } = useTheme();
	const particleColor = resolvedTheme === "light" ? "#000000" : "#ffffff";

	useEffect(() => {
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const connection = navigator as Navigator & {
			connection?: { saveData?: boolean };
			deviceMemory?: number;
		};
		const saveData = Boolean(connection.connection?.saveData);
		const viewportWidth = window.innerWidth;
		const hardwareConcurrency =
			typeof navigator.hardwareConcurrency === "number"
				? navigator.hardwareConcurrency
				: null;
		const deviceMemory =
			typeof connection.deviceMemory === "number"
				? connection.deviceMemory
				: null;
		const isHeadlessBrowser = navigator.userAgent.includes("HeadlessChrome");

		if (
			!shouldEnableAmbientEffects({
				prefersReducedMotion,
				saveData,
				viewportWidth,
				hardwareConcurrency,
				deviceMemory,
				isHeadlessBrowser,
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
			color={particleColor}
		/>
	);
}
