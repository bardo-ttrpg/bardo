"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

type DocsNavItem = {
	href: string;
	label: string;
	description: string;
};

export function DocsShell({
	items,
	children,
}: {
	items: readonly DocsNavItem[];
	children: ReactNode;
}) {
	const pathname = usePathname();

	return (
		<SidebarProvider>
			<div className="md:grid md:min-h-screen md:grid-cols-[18rem_minmax(0,1fr)]">
				<Sidebar>
					<SidebarHeader>
						<Link
							href="/"
							className="font-reading-heading text-3xl text-foreground"
						>
							Bardo
						</Link>
						<p className="font-reading-body text-foreground">
							Static MDX docs with a narrow product surface and a clear service
							boundary.
						</p>
					</SidebarHeader>
					<Separator />
					<SidebarContent>
						<SidebarGroup>
							<SidebarGroupLabel>Documentation</SidebarGroupLabel>
							<SidebarMenu>
								{items.map((item) => (
									<SidebarMenuItem key={item.href}>
										<SidebarMenuButton
											href={item.href}
											isActive={pathname === item.href}
										>
											<span>{item.label}</span>
										</SidebarMenuButton>
										<p className="font-reading-body mt-2 px-3 text-foreground">
											{item.description}
										</p>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroup>
					</SidebarContent>
				</Sidebar>
				<SidebarInset>
					<div className="flex items-center gap-3 border-b border-border px-6 py-4 md:hidden">
						<SidebarTrigger />
						<p className="ui-nav text-foreground">Documentation</p>
					</div>
					<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:py-24">
						{children}
					</div>
				</SidebarInset>
			</div>
		</SidebarProvider>
	);
}
