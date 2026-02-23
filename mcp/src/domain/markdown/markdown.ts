type ParsedMarkdown = {
	frontmatter: Record<string, string>;
	content: string;
};

function parseFrontmatterValue(rawValue: string): string {
	const trimmed = rawValue.trim();
	if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
		return trimmed.slice(1, -1).replaceAll('\\"', '"');
	}
	return trimmed;
}

export function parseMarkdown(raw: string): ParsedMarkdown {
	const normalized = raw.replaceAll("\r\n", "\n");
	if (!normalized.startsWith("---\n")) {
		return { frontmatter: {}, content: normalized };
	}

	const lines = normalized.split("\n");
	let closingIndex = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i]?.trim() === "---") {
			closingIndex = i;
			break;
		}
	}

	if (closingIndex === -1) {
		return { frontmatter: {}, content: normalized };
	}

	const frontmatter: Record<string, string> = {};
	for (const line of lines.slice(1, closingIndex)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf(":");
		if (separator <= 0) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = parseFrontmatterValue(trimmed.slice(separator + 1));
		frontmatter[key] = value;
	}

	let content = lines.slice(closingIndex + 1).join("\n");
	if (content.startsWith("\n")) {
		content = content.slice(1);
	}

	return { frontmatter, content };
}

function serializeFrontmatterValue(value: string): string {
	const normalized = value.replaceAll("\n", " ").trim();
	if (!normalized) return '""';
	if (/[#:{}[\],&*!?|<>=@`]/.test(normalized) || normalized.includes('"')) {
		return `"${normalized.replaceAll('"', '\\"')}"`;
	}
	return normalized;
}

export function renderMarkdown(
	frontmatter: Record<string, string>,
	content: string,
): string {
	const knownOrder = ["description", "title"];
	const rest = Object.keys(frontmatter)
		.filter((key) => !knownOrder.includes(key))
		.sort();
	const orderedKeys = [
		...knownOrder.filter((key) => key in frontmatter),
		...rest,
	];
	const frontmatterLines = orderedKeys.map(
		(key) => `${key}: ${serializeFrontmatterValue(frontmatter[key] ?? "")}`,
	);

	const normalizedContent = content.replaceAll("\r\n", "\n");
	return `---\n${frontmatterLines.join("\n")}\n---\n\n${normalizedContent}`;
}
