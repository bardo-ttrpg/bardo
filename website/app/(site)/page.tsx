import { headers } from "next/headers";
import Image from "next/image";
import { TransitionLink } from "@/components/transition-link";
import { Button } from "@/components/ui/button";
import { BardoViewTransition } from "@/components/view-transition";
import { isClerkAuthConfigured } from "@/lib/clerk-config";
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
const MOBILE_LANDING_IMAGE_USER_AGENT_PATTERN =
	/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i;

function shouldUseMobileLandingImage(
	userAgentHeader: string,
	mobileHint: string | null,
) {
	if (mobileHint === "?1") {
		return true;
	}

	return MOBILE_LANDING_IMAGE_USER_AGENT_PATTERN.test(userAgentHeader);
}

const IS_CLERK_CONFIGURED = isClerkAuthConfigured({
	publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
	secretKey: process.env.CLERK_SECRET_KEY,
});

export default async function SitePage() {
	const requestHeaders = await headers();
	const userAgentHeader = requestHeaders.get("user-agent") ?? "";
	const mobileHint = requestHeaders.get("sec-ch-ua-mobile");
	const useMobileLandingImage = shouldUseMobileLandingImage(
		userAgentHeader,
		mobileHint,
	);
	const landingImage = useMobileLandingImage
		? mobileLandingImage
		: desktopLandingImage;
	const landingImageAlt = useMobileLandingImage
		? "Bardo landing page preview for mobile devices"
		: "Bardo landing page preview";
	const landingImageSizes = useMobileLandingImage
		? "calc(100vw - 3rem)"
		: "(max-width: 1024px) calc(100vw - 4rem), 896px";

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
							<HomePrimaryAction clerkEnabled={IS_CLERK_CONFIGURED} />
						</nav>
					</header>

					<figure>
						{useMobileLandingImage ? (
							<Image
								src={landingImage}
								alt={landingImageAlt}
								placeholder="blur"
								preload
								className="my-6 rounded-sm"
								quality={100}
								sizes={landingImageSizes}
								width={500}
							/>
						) : (
							<Image
								src={landingImage}
								alt={landingImageAlt}
								placeholder="blur"
								preload
								className="my-6 h-auto w-full rounded-sm"
								quality={100}
								sizes={landingImageSizes}
								width={1000}
							/>
						)}
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
