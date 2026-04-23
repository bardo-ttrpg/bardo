import { getImageProps } from "next/image";
import { createElement } from "react";
import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";
import { BardoViewTransition } from "@/components/view-transition";
import { createPublicMetadata } from "@/lib/site-metadata";
import { getLandingPageJsonLd, homeSeo } from "@/lib/site-seo";
import desktopLandingImage from "../../../public/landing-page-image.png";
import mobileLandingImage from "../../../public/landing-page-image-mobile.jpg";
import { HomePrimaryAction } from "./_components/home-primary-action";
import { PublicPageShell } from "./_components/site-shells";

export const metadata = createPublicMetadata({
	title: homeSeo.title,
	description: homeSeo.description,
	socialDescription: homeSeo.socialDescription,
	path: "/",
	keywords: homeSeo.keywords,
});

const homeSectionClassName = "flex flex-col gap-2";
const bodyClassName = "font-reading-body text-muted-foreground ";
const homeActionClassName = "home-action-button";
const landingPageJsonLd = JSON.stringify(getLandingPageJsonLd());
const landingFooterLinks = [
	{ href: "/docs", label: "Docs" },
	{ href: "/pricing", label: "Pricing" },
	// { href: "/community", label: "Community" },
	// { href: "/blog", label: "Journal" },
	// { href: "/legal/terms", label: "Legal" },
] as const;
const desktopLandingImageProps = getImageProps({
	src: desktopLandingImage,
	alt: "Bardo landing page preview",
	quality: 82,
	loading: "eager",
	sizes: "(max-width: 1024px) calc(100vw - 4rem), 896px",
	width: 1000,
}).props;
const mobileLandingImageProps = getImageProps({
	src: mobileLandingImage,
	alt: "Bardo landing page preview for mobile devices",
	quality: 82,
	loading: "eager",
	sizes: "calc(100vw - 3rem)",
	width: 500,
}).props;

export default function SitePage() {
	const { srcSet: desktopSrcSet, ...desktopImageAttrs } =
		desktopLandingImageProps;
	const { srcSet: mobileSrcSet } = mobileLandingImageProps;
	const landingImage = createElement("img", {
		...desktopImageAttrs,
		alt: "Bardo landing page preview",
		className: "my-6 h-auto w-full rounded-sm",
		fetchPriority: "high",
	});

	return (
		<PublicPageShell className="max-w-5xl pt-8 text-balance lg:pt-4">
			<script type="application/ld+json">{landingPageJsonLd}</script>
			<BardoViewTransition name="bardo-page-region" variant="fade">
				<section className={`bardo-page-region ${homeSectionClassName}`}>
					<h1 className="sr-only">Bardo tabletop role-playing MCP</h1>

					<header className="flex flex-col gap-2">
						<p className={bodyClassName}>
							Bardo is the MCP for playing any tabletop role-playing game. It
							works with many modern AI clients, keeps your campaign files
							local, and grounds the model in your real workspace so it stays
							far more accurate.
						</p>

						<nav
							aria-label="Primary actions"
							className="flex flex-wrap items-center gap-4 pt-2"
						>
							<Button asChild size="sm" className={homeActionClassName}>
								<TransitionLink href="/docs">Start Playing</TransitionLink>
							</Button>
							<HomePrimaryAction />
						</nav>
					</header>

					<figure>
						<picture>
							<source
								media="(max-width: 767px)"
								sizes="calc(100vw - 3rem)"
								srcSet={mobileSrcSet}
							/>
							<source
								media="(min-width: 768px)"
								sizes="(max-width: 1024px) calc(100vw - 4rem), 896px"
								srcSet={desktopSrcSet}
							/>
							{landingImage}
						</picture>
					</figure>
				</section>
			</BardoViewTransition>

			<footer className="text-center text-sm">
				<nav aria-label="Primary site links">
					<ul className="flex w-full flex-row flex-wrap gap-4 p-0">
						{landingFooterLinks.map((link) => (
							<li key={link.href} className="list-none grow text-center">
								<TransitionLink
									href={link.href}
									className="landing-footer-link inline"
								>
									{link.label}
								</TransitionLink>
							</li>
						))}
					</ul>
				</nav>
			</footer>
		</PublicPageShell>
	);
}
