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
				"mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-16 sm:py-24",
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
		<SiteFrame className={cn("max-w-3xl gap-10", className)}>
			{children}
		</SiteFrame>
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
		<header className="space-y-4">
			<p className="ui-label text-muted-foreground">{eyebrow}</p>
			<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
				{title}
			</h1>
			<p className="font-reading-body max-w-2xl text-foreground">
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
		<ul className="space-y-3 pl-0">
			{items.map((item) => (
				<li key={item.href} className="list-none">
					<Link
						href={item.href}
						className="font-reading-body underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
					>
						{item.label}
					</Link>{" "}
					<span className="font-reading-body text-foreground">
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
		<nav className={cn("flex flex-wrap gap-4", className)}>
			{links.map((link) => (
				<Link
					key={link.href}
					href={link.href}
					className="ui-nav underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
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
		<section className="space-y-4">
			<h2 className="font-reading-heading text-3xl text-foreground">{title}</h2>
			<div className="prose-reading space-y-4 text-foreground">{children}</div>
		</section>
	);
}

export function Minimal404Page() {
	return (
		<PublicPageShell className="justify-center">
			<div className="w-full max-w-2xl space-y-10">
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
