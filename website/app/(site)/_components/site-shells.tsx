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
				"mx-auto flex w-full max-w-5xl flex-col px-6 sm:px-8",
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

export function Minimal404Page() {
	return (
		<PublicPageShell className="max-w-5xl justify-center pb-12 pt-8 sm:pb-16 sm:pt-8 lg:pb-20 lg:pt-10">
			<BardoViewTransition name="bardo-page-region">
				<section className="bardo-page-region mx-auto flex w-full max-w-3xl flex-col gap-8">
					<header className="flex flex-col gap-4 border-b border-border pb-6">
						<p className="ui-label text-muted-foreground">404 Error</p>
						<h1 className="font-reading-heading text-4xl text-foreground sm:text-5xl">
							Page not found.
						</h1>
					</header>

					<footer className="text-sm underline">
						<TransitionLink href="/">Go Back Home</TransitionLink>
					</footer>
				</section>
			</BardoViewTransition>
		</PublicPageShell>
	);
}
