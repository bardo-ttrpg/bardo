"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

type SiteMenuPanelItem = {
	title: string;
	description: string;
	href: string;
};

export default function SiteMenuPanel({
	label,
	items,
	align = "start",
}: {
	label: string;
	items: readonly SiteMenuPanelItem[];
	align?: "start" | "end";
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();

	return (
		<div
			className="relative"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
			onBlurCapture={(event) => {
				const nextTarget = event.relatedTarget;
				if (
					!(nextTarget instanceof Node) ||
					!event.currentTarget.contains(nextTarget)
				) {
					setOpen(false);
				}
			}}
		>
			<button
				type="button"
				className="site-menu-trigger touch-manipulation"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((current) => !current)}
			>
				<span>{label}</span>
				<ChevronDown
					className={`h-3.5 w-3.5 transition-transform duration-200 ${
						open ? "rotate-180" : ""
					}`}
					aria-hidden="true"
				/>
			</button>

			<div
				id={panelId}
				className={`site-menu-panel ${
					open
						? "pointer-events-auto translate-y-0 opacity-100"
						: "pointer-events-none -translate-y-1 opacity-0"
				} ${align === "end" ? "right-0 left-auto" : ""}`}
			>
				<div className="grid gap-2 md:grid-cols-2">
					{items.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							prefetch={false}
							className="site-menu-item"
							onClick={() => setOpen(false)}
						>
							<span className="text-sm font-medium text-foreground">
								{item.title}
							</span>
							<span className="mt-1 block text-sm leading-6 text-muted-foreground">
								{item.description}
							</span>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
