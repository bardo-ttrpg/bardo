export function isExternalHref(href: string | undefined): boolean {
	if (!href) return false;
	return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:");
}

export function externalLinkRel(rel: string | undefined): string {
	const tokens = new Set((rel ?? "").split(/\s+/).filter(Boolean));
	tokens.add("noopener");
	tokens.add("noreferrer");
	return Array.from(tokens).join(" ");
}
