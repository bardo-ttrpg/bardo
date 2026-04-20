"use client";

import { usePathname } from "next/navigation";
import { TransitionLink } from "@/components/transition-link";
import { cn } from "@/lib/utils";

type BlogSidebarEntry = {
	href: string;
	title: string;
};

export function BlogSidebarNav({
	entries,
}: {
	entries: readonly BlogSidebarEntry[];
}) {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Blog posts"
			className="flex flex-col gap-2 border-b border-border pb-6 lg:border-b-0 lg:pb-0"
		>
			<ul className="flex flex-col">
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
									{item.title}
								</span>
							</TransitionLink>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
