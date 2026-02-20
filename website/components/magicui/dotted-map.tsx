"use client";

import DottedMapLib from "dotted-map";
import { useTheme } from "next-themes";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface LocationInfo {
	name: string;
	type: string;
	description: string;
}

export interface MapMarker {
	lat: number;
	lng: number;
	location?: LocationInfo;
}

interface DottedMapProps {
	markers?: MapMarker[];
}

/**
 * Module-level SVG cache. The DottedMapLib computation is expensive (~200–500 ms
 * on a mid-range device). We lazily compute each variant once and reuse it for all
 * subsequent renders and theme switches.
 */
let _lib: InstanceType<typeof DottedMapLib> | null = null;
let _svgDark: string | null = null;
let _svgLight: string | null = null;

function getLib() {
	if (!_lib) {
		_lib = new DottedMapLib({ height: 80, grid: "diagonal" });
	}
	return _lib;
}

function getMapSvg(dark: boolean): string {
	if (dark) {
		if (!_svgDark) {
			_svgDark = getLib().getSVG({
				radius: 0.22,
				color: "#ffffff15",
				shape: "circle",
				backgroundColor: "transparent",
			});
		}
		return _svgDark;
	}
	if (!_svgLight) {
		_svgLight = getLib().getSVG({
			radius: 0.22,
			color: "#00000018",
			shape: "circle",
			backgroundColor: "transparent",
		});
	}
	return _svgLight;
}

export default function DottedMap({ markers = [] }: DottedMapProps) {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const { resolvedTheme } = useTheme();

	const isDark = resolvedTheme !== "light";
	const svgMap = getMapSvg(isDark);
	const markerColor = isDark ? "#ffffff" : "#000000";

	const projectPoint = (lat: number, lng: number) => ({
		x: (lng + 180) * (800 / 360),
		y: (90 - lat) * (400 / 180),
	});

	const activeMarker = activeIndex !== null ? markers[activeIndex] : undefined;
	const activePos = activeMarker
		? projectPoint(activeMarker.lat, activeMarker.lng)
		: null;

	// Tooltip position as percentage within the 800×400 viewBox
	const tipLeft = activePos ? (activePos.x / 800) * 100 : 50;
	const tipTop = activePos ? (activePos.y / 400) * 100 : 50;
	// Show tooltip below marker if it's in the top 30% of the map
	const showBelow = tipTop < 32;

	return (
		/* Outer scroll wrapper for mobile */
		<div className="overflow-x-auto">
			<div className="relative" style={{ minWidth: 600 }}>
				{/* Dotted background map */}
				{/* biome-ignore lint/performance/noImgElement: data URI rendering for generated map SVG */}
				<img
					src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
					className="h-full w-full select-none pointer-events-none [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]"
					alt="world map"
					draggable={false}
				/>

				{/* Interactive SVG overlay */}
				<svg
					viewBox="0 0 800 400"
					className="absolute inset-0 h-full w-full select-none"
					role="img"
					aria-label="Interactive world map markers"
					onMouseLeave={() => setActiveIndex(null)}
				>
					<title>Interactive world map markers</title>
					{markers.map((marker, i) => {
						const { x, y } = projectPoint(marker.lat, marker.lng);
						const isActive = i === activeIndex;
						const markerKey = `${marker.lat}:${marker.lng}:${marker.location?.name ?? "marker"}`;
						return (
							<g key={markerKey}>
								{/* Invisible hit area / accessible trigger */}
								{/* biome-ignore lint/a11y/useSemanticElements: SVG markers require circle interactions to preserve map geometry */}
								<circle
									cx={x}
									cy={y}
									r={14}
									fill="transparent"
									className="cursor-pointer"
									role="button"
									tabIndex={0}
									aria-label={marker.location?.name ?? "Map marker"}
									onClick={() => setActiveIndex(isActive ? null : i)}
									onMouseEnter={() => setActiveIndex(i)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											setActiveIndex(isActive ? null : i);
										}
									}}
								/>
								{/* Outer glow */}
								<circle
									cx={x}
									cy={y}
									r={isActive ? 10 : 7}
									fill={markerColor}
									opacity={isActive ? 0.18 : 0.1}
									style={{ transition: "r 0.15s, opacity 0.15s" }}
								/>
								{/* Inner dot */}
								<circle
									cx={x}
									cy={y}
									r={isActive ? 4 : 2.5}
									fill={markerColor}
									opacity={isActive ? 1 : 0.75}
									style={{ transition: "r 0.15s" }}
								/>
							</g>
						);
					})}
				</svg>

				{/* Tooltip */}
				{activeMarker?.location && (
					<div
						className={cn(
							"pointer-events-none absolute z-20 w-52 border border-border bg-card px-4 py-3",
							"shadow-[0_0_0_1px_rgba(128,128,128,0.08)]",
						)}
						style={{
							left: `${Math.max(13, Math.min(87, tipLeft))}%`,
							top: showBelow
								? `calc(${tipTop}% + 18px)`
								: `calc(${tipTop}% - 12px)`,
							transform: showBelow
								? "translate(-50%, 0)"
								: "translate(-50%, -100%)",
						}}
					>
						<p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
							{activeMarker.location.type}
						</p>
						<p className="mb-1.5 font-mono text-sm font-semibold text-foreground">
							{activeMarker.location.name}
						</p>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{activeMarker.location.description}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
