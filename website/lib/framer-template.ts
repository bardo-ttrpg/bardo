import { readFile } from "node:fs/promises";
import path from "node:path";

export type FramerTemplatePage = {
	bodyHtml: string;
	description: string | null;
	styleBlocks: string[];
	title: string | null;
};

const FRAMER_ORIGIN = "https://sparkly-architecture-449601.framer.app";

function extractTagBlocks(html: string, tagName: string) {
	const pattern = new RegExp(
		`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`,
		"gi",
	);

	return Array.from(html.matchAll(pattern), (match) => match[0]);
}

function extractFirst(html: string, pattern: RegExp) {
	const match = html.match(pattern);
	return match?.[1]?.trim() ?? null;
}

function extractBodyHtml(html: string) {
	const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

	if (!match) {
		throw new Error("Template HTML is missing a <body> element.");
	}

	const [, bodyHtml = ""] = match;
	return bodyHtml
		.replaceAll(`${FRAMER_ORIGIN}/`, "/")
		.replaceAll(FRAMER_ORIGIN, "")
		.replace(/href="\.\//g, 'href="/')
		.replace(/<script\b[\s\S]*?<\/script>/gi, "")
		.trim();
}

function resolveTemplatePath(relativePath: string) {
	return path.join(process.cwd(), "..", "template", relativePath);
}

export async function loadFramerTemplatePage(
	relativePath: string,
): Promise<FramerTemplatePage> {
	const source = await readFile(resolveTemplatePath(relativePath), "utf8");

	return {
		bodyHtml: extractBodyHtml(source),
		description: extractFirst(
			source,
			/<meta\s+name="description"\s+content="([^"]*)"/i,
		),
		styleBlocks: extractTagBlocks(source, "style"),
		title: extractFirst(source, /<title>([\s\S]*?)<\/title>/i),
	};
}
