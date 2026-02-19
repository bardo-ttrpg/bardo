"use client";

import { cn } from "@/lib/utils";
import DottedMapLib from "dotted-map";
import { useMemo, useState } from "react";

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
	dotColor?: string;
	markerColor?: string;
}

export default function DottedMap({
	markers = [],
	dotColor = "#ffffff18",
	markerColor = "#ffffff",
}: DottedMapProps) {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	// Memoize the expensive map generation — only recomputes when dotColor changes
	const svgMap = useMemo(() => {
		const map = new DottedMapLib({ height: 100, grid: "diagonal" });
		return map.getSVG({
			radius: 0.22,
			color: dotColor,
			shape: "circle",
			backgroundColor: "transparent",
		});
	}, [dotColor]);

	const projectPoint = (lat: number, lng: number) => ({
		x: (lng + 180) * (800 / 360),
		y: (90 - lat) * (400 / 180),
	});

	const activeMarker =
		activeIndex !== null ? markers[activeIndex] : undefined;
	const activePos =
		activeIndex !== null && markers[activeIndex]
			? projectPoint(markers[activeIndex]!.lat, markers[activeIndex]!.lng)
			: null;

	// Tooltip position as percentage within the 800×400 viewBox
	const tipLeft = activePos ? (activePos.x / 800) * 100 : 50;
	const tipTop = activePos ? (activePos.y / 400) * 100 : 50;
	// Show tooltip below marker if it's in the top 30% of the map
	const showBelow = tipTop < 32;

	return (
		/* Outer scroll wrapper for mobile */
		<div className="overflow-x-auto">
			<div
				className="relative"
				style={{ minWidth: 600 }}
				onMouseLeave={() => setActiveIndex(null)}
			>
				{/* Dotted background map */}
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
				>
					{markers.map((marker, i) => {
						const { x, y } = projectPoint(marker.lat, marker.lng);
						const isActive = i === activeIndex;
						return (
							<g
								key={i}
								className="cursor-pointer"
								onClick={() =>
									setActiveIndex(isActive ? null : i)
								}
								onMouseEnter={() => setActiveIndex(i)}
							>
								{/* Invisible hit area */}
								<circle cx={x} cy={y} r={14} fill="transparent" />
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
							"shadow-[0_0_0_1px_rgba(255,255,255,0.04)]",
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
