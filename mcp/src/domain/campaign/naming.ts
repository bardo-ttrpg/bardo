export function slugify(input: string, fallback = "unknown"): string {
	const slug = input
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
	return slug || fallback;
}

export function toDisplayName(slugOrText: string): string {
	return slugOrText
		.replace(/-/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase())
		.trim();
}

export function toTitleCase(text: string): string {
	return text
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() + word.slice(1))
		.join(" ")
		.trim();
}
