import type { ReactNode } from "react";
import { TransitionLink } from "@/components/transition-link";
import { BardoViewTransition } from "@/components/view-transition";
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

function SiteBrandHeader({ className }: { className?: string }) {
	return (
		<header
			className={cn("flex items-center justify-between gap-4", className)}
		>
			<TransitionLink href="/" aria-label="Bardo home" className="inline-block">
				<BrandScrambleHover
					text="BARDO"
					scrambleSpeed={85}
					className="font-reading-heading max-w-3xl text-3xl font-bold text-foreground"
				/>
			</TransitionLink>
			<ThemeToggle />
		</header>
	);
}

export function SiteBrandHeaderFrame() {
	return (
		<div className="bardo-persistent-surface mx-auto w-full max-w-5xl px-6 pt-10 sm:px-8 sm:pt-12 lg:pt-16">
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

export function Minimal404Page() {
	return (
		<PublicPageShell className="max-w-5xl justify-center pb-12 pt-8 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
			<BardoViewTransition name="bardo-page-region">
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
						<TransitionLink href="/">Go Back Home</TransitionLink>
					</div>
				</section>
			</BardoViewTransition>
		</PublicPageShell>
	);
}
