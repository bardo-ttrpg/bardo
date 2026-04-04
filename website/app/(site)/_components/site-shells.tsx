import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BrandScrambleHover } from "./brand-scramble-hover";
import { ThemeToggle } from "./theme-toggle";

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

export function SiteBrandHeader({ className }: { className?: string }) {
	return (
		<header
			className={cn("flex items-center justify-between gap-4", className)}
		>
			<Link href="/" aria-label="Bardo home" className="inline-block">
				<BrandScrambleHover
					text="BARDO"
					scrambleSpeed={85}
					className="font-reading-heading max-w-3xl text-3xl font-bold text-foreground"
				/>
			</Link>
			<ThemeToggle />
		</header>
	);
}

export function SiteBrandHeaderFrame() {
	return (
		<div className="mx-auto w-full max-w-5xl pt-10 sm:px-8 sm:pt-12 lg:pt-16 px-6">
			<SiteBrandHeader />
		</div>
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
		<div className="min-h-screen">
			<PublicPageShell className="max-w-5xl justify-center pb-12 pt-8 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
				<section className="mx-auto flex w-full max-w-3xl flex-col gap-8 border border-border bg-card px-6 py-8 sm:px-8 sm:py-10">
					<div className="flex flex-col gap-4 border-b border-border pb-6">
						<p className="ui-label text-muted-foreground">404</p>
						<div className="flex flex-col gap-3">
							<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
								Page not found.
							</h1>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-3 underline">
						<Link href="/">Go Back Home</Link>
					</div>
				</section>
			</PublicPageShell>
		</div>
	);
}
