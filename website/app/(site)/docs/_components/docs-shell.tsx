"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	type ReactNode,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/ui/sidebar";
import type { DocsSearchEntry, DocsSection } from "@/content/site-content";
import { cn } from "@/lib/utils";

type DocsNavEntry = {
	href: string;
	title: string;
	navigationLabel: string;
	sections: readonly DocsSection[];
};

type DocsNavGroup = {
	id: string;
	label: string;
	entries: readonly DocsNavEntry[];
};

export function DocsShell({
	groups,
	searchEntries,
	children,
}: {
	groups: readonly DocsNavGroup[];
	searchEntries: readonly DocsSearchEntry[];
	children: ReactNode;
}) {
	return (
		<SidebarProvider defaultOpen={true}>
			<DocsShellFrame groups={groups} searchEntries={searchEntries}>
				{children}
			</DocsShellFrame>
		</SidebarProvider>
	);
}

function DocsShellFrame({
	groups,
	searchEntries,
	children,
}: {
	groups: readonly DocsNavGroup[];
	searchEntries: readonly DocsSearchEntry[];
	children: ReactNode;
}) {
	const pathname = usePathname();
	const { setOpenMobile } = useSidebar();
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);
	const searchResults = useMemo(() => {
		const normalizedQuery = deferredQuery.trim().toLowerCase();
		if (!normalizedQuery) {
			return [];
		}

		return searchEntries
			.filter((entry) =>
				[
					entry.title,
					entry.description,
					entry.groupLabel,
					entry.matchLabel,
					entry.href,
				]
					.join(" ")
					.toLowerCase()
					.includes(normalizedQuery),
			)
			.slice(0, 8);
	}, [deferredQuery, searchEntries]);

	const hasSearchResults = deferredQuery.trim().length > 0;

	useEffect(() => {
		if (!pathname) {
			return;
		}

		setQuery("");
		setOpenMobile(false);
	}, [pathname, setOpenMobile]);

	return (
		<div className="min-h-svh w-full bg-background md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
			<Sidebar
				className="border-r border-sidebar-border"
				collapsible="offcanvas"
			>
				<SidebarHeader className="gap-4 border-b border-sidebar-border px-4 py-4">
					<div className="flex flex-col gap-1">
						<Link
							href="/"
							className="font-reading-heading text-3xl leading-none text-foreground font-bold"
						>
							BARDO
						</Link>
					</div>
					<div className="space-y-3">
						<div className="relative">
							<SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<SidebarInput
								id="docs-search"
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search docs..."
								autoComplete="off"
								aria-label="Search docs"
								className="h-8 rounded-sm border-sidebar-border pl-8"
							/>
						</div>
					</div>
				</SidebarHeader>
				<SidebarContent>
					{hasSearchResults ? (
						<SidebarGroup className="px-2 py-3">
							<SidebarGroupLabel>Search Results</SidebarGroupLabel>
							<div className="mt-3 space-y-1">
								{searchResults.length > 0 ? (
									searchResults.map((entry) => (
										<Link
											key={entry.href}
											href={entry.href}
											className="block rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent"
										>
											<p className="ui-nav text-sidebar-foreground">
												{entry.matchLabel}
											</p>
											<p className="font-reading-body text-sm text-muted-foreground">
												{entry.kind === "section"
													? `${entry.description} · ${entry.groupLabel}`
													: `${entry.groupLabel} · ${entry.description}`}
											</p>
										</Link>
									))
								) : (
									<p className="font-reading-body px-3 text-sm text-muted-foreground">
										No docs matched that search yet.
									</p>
								)}
							</div>
						</SidebarGroup>
					) : (
						groups.map((group) => (
							<SidebarGroup key={group.id} className="px-2 py-3">
								<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
								<SidebarMenu className="mt-2 gap-1">
									{group.entries.map((entry) => (
										<SidebarMenuItem key={entry.href}>
											{(() => {
												const isCurrentPage = pathname === entry.href;

												return (
													<SidebarMenuButton
														asChild
														isActive={false}
														className={cn(
															"h-auto rounded-none bg-transparent px-3 py-2 hover:bg-transparent active:bg-transparent",
															isCurrentPage
																? "font-medium text-foreground"
																: "text-muted-foreground hover:text-foreground",
														)}
													>
														<Link href={entry.href}>
															<span
																className={cn(
																	"ui-nav",
																	isCurrentPage
																		? "!text-foreground"
																		: "!text-muted-foreground",
																)}
															>
																{entry.navigationLabel}
															</span>
														</Link>
													</SidebarMenuButton>
												);
											})()}
										</SidebarMenuItem>
									))}
								</SidebarMenu>
							</SidebarGroup>
						))
					)}
				</SidebarContent>
			</Sidebar>
			<SidebarInset className="min-w-0 bg-background">
				<div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur sm:px-6 md:hidden">
					<SidebarTrigger />
					<div className="min-w-0">
						<p className="ui-label">Documentation</p>
					</div>
				</div>
				<div className="mx-auto flex w-full max-w-[92rem] flex-1 flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
					<div className="grid min-w-0 gap-12 xl:grid-cols-[minmax(0,48rem)_15rem] xl:items-start">
						<div className="min-w-0">{children}</div>
						<aside className="hidden xl:block">
							{/* <div className="sticky top-8 rounded-2xl border border-border bg-muted/20 p-5">
								<p className="ui-label">On this page</p>
								{activeEntry?.sections.length ? (
									<nav aria-label="On this page" className="mt-4">
										<ul className="space-y-1.5">
											{activeEntry.sections.map((section) => (
												<li key={section.id}>
													<Link
														href={`${activeEntry.href}#${section.id}`}
														className={cn(
															"font-reading-body block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
														)}
													>
														{section.title}
													</Link>
												</li>
											))}
										</ul>
									</nav>
								) : (
									<p className="font-reading-body mt-4 text-sm text-muted-foreground">
										This page has no section links yet.
									</p>
								)}
								<Separator className="my-4" />
								<Link
									href="/docs"
									className="font-reading-body text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
								>
									Back to overview
								</Link>
							</div> */}
						</aside>
					</div>
				</div>
			</SidebarInset>
		</div>
	);
}
