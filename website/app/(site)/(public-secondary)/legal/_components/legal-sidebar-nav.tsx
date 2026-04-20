"use client";

import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/transition-link";
import { cn } from "@/lib/utils";

type LegalSidebarEntry = {
	href: string;
	navigationLabel: string;
};

export function LegalSidebarNav({
	entries,
}: {
	entries: readonly LegalSidebarEntry[];
}) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Legal sections"
			className="flex flex-col gap-2 border-b border-border pb-6 lg:border-b-0 lg:pb-0"
		>
			<ul className="flex justify-between lg:flex-col">
				{entries.map((item) => {
					const isCurrentPage = item.href === pathname;

					return (
						<li key={item.href}>
							<TransitionLink
								href={item.href}
								className="rounded-none bg-transparent py-2 transition-colors hover:bg-transparent lg:py-2"
							>
								<span
									className={cn(
										"ui-nav",
										isCurrentPage
											? "font-medium !text-foreground"
											: "!text-muted-foreground hover:!text-foreground",
									)}
								>
									{item.navigationLabel}
								</span>
							</TransitionLink>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
