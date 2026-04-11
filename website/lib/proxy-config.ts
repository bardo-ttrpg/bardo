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
		pathname === "/" ||
		pathname === "/pricing" ||
		pathname.startsWith("/dashboard") ||
		pathname === "/sign-in" ||
		pathname.startsWith("/sign-in/") ||
		pathname === "/forgot-password" ||
		pathname.startsWith("/forgot-password/") ||
		pathname === "/sign-up" ||
		pathname.startsWith("/sign-up/")
	);
}
