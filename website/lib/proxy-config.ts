const PAGE_PROXY_MATCHER_SOURCE =
	"/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)";

export const PAGE_PROXY_MATCHER = {
	source: PAGE_PROXY_MATCHER_SOURCE,
	missing: [
		{ type: "header", key: "next-router-prefetch" },
		{ type: "header", key: "purpose", value: "prefetch" },
	] as const,
};

export const API_PROXY_MATCHER = "/(api|trpc)(.*)";

export function shouldUseClerkOnlyProxyPathname(pathname: string): boolean {
	return (
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		pathname === "/trpc" ||
		pathname.startsWith("/trpc/")
	);
}

export function shouldRunClerkForPagePathname(pathname: string): boolean {
	return (
		pathname.startsWith("/dashboard") ||
		pathname === "/sign-in" ||
		pathname.startsWith("/sign-in/") ||
		pathname === "/forgot-password" ||
		pathname.startsWith("/forgot-password/") ||
		pathname === "/sign-up" ||
		pathname.startsWith("/sign-up/")
	);
}
