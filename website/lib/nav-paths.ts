function normalizeNavPath(pathname: string): string {
	const trimmed = pathname.trim();
	if (trimmed === "" || trimmed === "/") {
		return "/";
	}

	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function isNavPathCurrent(
	pathname: string | null | undefined,
	href: string,
): boolean {
	if (typeof pathname !== "string" || pathname.trim() === "") {
		return false;
	}

	const normalizedPath = normalizeNavPath(pathname);
	const normalizedHref = normalizeNavPath(href);

	if (normalizedHref === "/") {
		return normalizedPath === "/";
	}

	return (
		normalizedPath === normalizedHref ||
		normalizedPath.startsWith(`${normalizedHref}/`)
	);
}
