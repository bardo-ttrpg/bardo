const CLERK_PROXY_BYPASS_PATHS = new Set([
	"/api/auth/introspect-key",
	"/api/connect/runtime-status",
	"/api/connect/bridge-session/start",
	"/api/connect/bridge-session/poll",
	"/api/connect/bridge-session/refresh",
]);

export function shouldUseClerkOnlyProxyPathname(pathname: string): boolean {
	if (CLERK_PROXY_BYPASS_PATHS.has(pathname)) {
		return false;
	}

	return (
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		pathname === "/trpc" ||
		pathname.startsWith("/trpc/")
	);
}

export function shouldRunClerkForPagePathname(pathname: string): boolean {
	return (
		pathname === "/pricing" ||
		pathname.startsWith("/dashboard") ||
		pathname === "/sign-in" ||
		pathname.startsWith("/sign-in/") ||
		pathname === "/sign-up" ||
		pathname.startsWith("/sign-up/")
	);
}
