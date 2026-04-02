import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function SiteFrame({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<main
			className={cn(
				"mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 sm:px-8",
				className,
			)}
		>
			{children}
		</main>
	);
}

export function PublicPageShell({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<SiteFrame className={cn("max-w-3xl", className)}>{children}</SiteFrame>
	);
}

export function PublicPageHeader({
	eyebrow,
	title,
	description,
}: {
	eyebrow: string;
	title: string;
	description: string;
}) {
	return (
		<header className="flex flex-col gap-4">
			<p className="ui-label text-muted-foreground">{eyebrow}</p>
			<h1 className="font-reading-heading text-5xl text-foreground sm:text-6xl">
				{title}
			</h1>
			<p className="font-reading-body max-w-2xl text-muted-foreground">
				{description}
			</p>
		</header>
	);
}

export function RouteList({
	items,
}: {
	items: Array<{ href: string; label: string; description: string }>;
}) {
	return (
		<ul className="flex flex-col gap-4 pl-0">
			{items.map((item) => (
				<li key={item.href} className="list-none">
					<Link
						href={item.href}
						className="interactive-link font-reading-body text-foreground"
					>
						{item.label}
					</Link>{" "}
					<span className="font-reading-body text-muted-foreground">
						{item.description}
					</span>
				</li>
			))}
		</ul>
	);
}

export function InlineLinkNav({
	links,
	className,
}: {
	links: Array<{ href: string; label: string }>;
	className?: string;
}) {
	return (
		<nav className={cn("flex flex-wrap gap-5", className)}>
			{links.map((link) => (
				<Link
					key={link.href}
					href={link.href}
					className="interactive-link ui-nav text-foreground"
				>
					{link.label}
				</Link>
			))}
		</nav>
	);
}

export function ProseSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className="font-reading-heading text-3xl text-foreground">{title}</h2>
			<div className="prose-reading flex flex-col gap-4">{children}</div>
		</section>
	);
}

export function Minimal404Page() {
	return (
		<PublicPageShell className="justify-center">
			<div className="flex w-full max-w-2xl flex-col gap-10">
				<PublicPageHeader
					eyebrow="404"
					title="Page not found."
					description="This route is no longer part of the public surface. Use one of the remaining entry points below."
				/>
				<RouteList
					items={[
						{
							href: "/",
							label: "Home",
							description: "Return to the main entry point.",
						},
						{
							href: "/docs",
							label: "Docs",
							description: "Read the core setup and usage guides.",
						},
						{
							href: "/dashboard",
							label: "Dashboard",
							description: "Open the protected account and bridge workflow.",
						},
					]}
				/>
			</div>
		</PublicPageShell>
	);
}
