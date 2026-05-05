import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { writeTextAtomic } from "./file-utils";

const RULES_BOOTSTRAP_VERSION = 1;
const NORMALIZED_RULES_DIR = "rules/normalized";
const INDEX_RELATIVE_PATH = `${NORMALIZED_RULES_DIR}/index.json`;
const STOP_WORDS = new Set([
	"a",
	"an",
	"and",
	"are",
	"as",
	"at",
	"be",
	"by",
	"for",
	"from",
	"how",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"of",
	"on",
	"or",
	"that",
	"the",
	"their",
	"there",
	"these",
	"this",
	"to",
	"use",
	"when",
	"with",
	"your",
]);

type Heading = {
	level: number;
	title: string;
	lineIndex: number;
};

type RawSection = {
	title: string;
	parentHeading: string | null;
	body: string;
};

type SectionIndexEntry = {
	order: number;
	title: string;
	filename: string;
	summary: string;
	tags: string[];
	keywords: string[];
	hasTables: boolean;
	hasExamples: boolean;
	hasExceptions: boolean;
	parentHeading?: string;
	crossReferences?: string[];
};

type TrackingProfile = {
	strong: string[];
	light: string[];
	minimal: string[];
};

export type RulebookBootstrapResult = {
	version: number;
	sourceRelativePath: string;
	sourceHash: string;
	sectionCount: number;
	indexPath: string;
	normalizedDirectory: string;
	recommendedSimulationDepth: "light" | "standard" | "deep";
	simulationProfile: {
		likelyGameSystemStructure: string;
		corePlayLoop: string;
		tracking: TrackingProfile;
		signals: string[];
	};
};

const TAG_PATTERNS: Array<{ tag: string; patterns: RegExp[] }> = [
	{ tag: "introduction", patterns: [/\bintroduction\b/i, /\boverview\b/i] },
	{
		tag: "character-creation",
		patterns: [/\bcharacter creation\b/i, /\bcreate(?:s|d)? a character\b/i],
	},
	{
		tag: "core-resolution",
		patterns: [/\bresolution\b/i, /\bskill check\b/i, /\btest\b/i, /\broll\b/i],
	},
	{
		tag: "core-concepts",
		patterns: [/\bcore concepts?\b/i, /\bfundamentals?\b/i],
	},
	{
		tag: "attribute",
		patterns: [/\battributes?\b/i, /\bability scores?\b/i, /\bstats?\b/i],
	},
	{ tag: "skill", patterns: [/\bskills?\b/i, /\bproficienc(?:y|ies)\b/i] },
	{ tag: "background", patterns: [/\bbackgrounds?\b/i, /\borigins?\b/i] },
	{
		tag: "class",
		patterns: [/\bclasses?\b/i, /\barchetypes?\b/i, /\bjobs?\b/i],
	},
	{ tag: "species", patterns: [/\bspecies\b/i, /\brace\b/i] },
	{ tag: "ancestry", patterns: [/\bancestr(?:y|ies)\b/i, /\blineage\b/i] },
	{ tag: "combat", patterns: [/\bcombat\b/i, /\bbattle\b/i] },
	{ tag: "initiative", patterns: [/\binitiative\b/i, /\bturn order\b/i] },
	{ tag: "attack", patterns: [/\battacks?\b/i, /\bstrike\b/i, /\bto hit\b/i] },
	{ tag: "damage", patterns: [/\bdamage\b/i, /\bwounds?\b/i] },
	{
		tag: "defense",
		patterns: [/\bdefen[cs]e\b/i, /\barmor class\b/i, /\bac\b/i],
	},
	{
		tag: "movement",
		patterns: [/\bmovement\b/i, /\bspeed\b/i, /\bposition(?:ing)?\b/i],
	},
	{ tag: "condition", patterns: [/\bconditions?\b/i] },
	{ tag: "status-effect", patterns: [/\bstatus effects?\b/i] },
	{ tag: "magic", patterns: [/\bmagic\b/i, /\bspellcasting\b/i] },
	{ tag: "spell", patterns: [/\bspells?\b/i] },
	{ tag: "ritual", patterns: [/\brituals?\b/i] },
	{ tag: "power", patterns: [/\bpowers?\b/i] },
	{ tag: "item", patterns: [/\bitems?\b/i, /\bgear\b/i] },
	{ tag: "equipment", patterns: [/\bequipment\b/i, /\bgear\b/i] },
	{ tag: "weapon", patterns: [/\bweapons?\b/i] },
	{ tag: "armor", patterns: [/\barmor\b/i, /\barmour\b/i] },
	{ tag: "inventory", patterns: [/\binventory\b/i, /\bencumbrance\b/i] },
	{ tag: "downtime", patterns: [/\bdowntime\b/i, /\bbetween adventures\b/i] },
	{ tag: "travel", patterns: [/\btravel\b/i, /\bjourney\b/i, /\boverland\b/i] },
	{ tag: "survival", patterns: [/\bsurvival\b/i, /\bforaging\b/i] },
	{ tag: "healing", patterns: [/\bhealing\b/i, /\brecovery\b/i] },
	{ tag: "crafting", patterns: [/\bcraft(?:ing)?\b/i] },
	{ tag: "advancement", patterns: [/\badvancement\b/i, /\bprogression\b/i] },
	{ tag: "leveling", patterns: [/\blevel(?:ing|ling)?\b/i, /\blevel up\b/i] },
	{ tag: "experience", patterns: [/\bexperience\b/i, /\bxp\b/i] },
	{
		tag: "social",
		patterns: [/\bsocial\b/i, /\binfluence\b/i, /\bpersuasion\b/i],
	},
	{ tag: "reputation", patterns: [/\breputation\b/i, /\brenown\b/i] },
	{ tag: "faction", patterns: [/\bfactions?\b/i, /\bguilds?\b/i] },
	{ tag: "law", patterns: [/\blaw\b/i, /\blegal\b/i] },
	{ tag: "religion", patterns: [/\breligion\b/i, /\bfaith\b/i, /\bchurch\b/i] },
	{
		tag: "economy",
		patterns: [/\beconom(?:y|ic)\b/i, /\btrade\b/i, /\bmarket\b/i],
	},
	{ tag: "world", patterns: [/\bworld\b/i, /\bsetting\b/i, /\blore\b/i] },
	{ tag: "location", patterns: [/\blocations?\b/i, /\bregions?\b/i] },
	{
		tag: "settlement",
		patterns: [/\bsettlements?\b/i, /\btowns?\b/i, /\bcities\b/i],
	},
	{ tag: "npc", patterns: [/\bnpcs?\b/i, /\bnon-player characters?\b/i] },
	{ tag: "creature", patterns: [/\bcreatures?\b/i] },
	{ tag: "monster", patterns: [/\bmonsters?\b/i] },
	{ tag: "enemy", patterns: [/\benemies\b/i, /\badversaries\b/i] },
	{ tag: "boss", patterns: [/\bboss(?:es)?\b/i] },
	{ tag: "quest", patterns: [/\bquests?\b/i, /\bmissions?\b/i] },
	{
		tag: "glossary",
		patterns: [/\bglossary\b/i, /\bterms\b/i, /\bdefinitions\b/i],
	},
];

function sha256(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex");
}

function toNormalizedText(raw: string): string {
	return raw.replaceAll("\r\n", "\n");
}

function isStructuralLine(trimmed: string): boolean {
	return (
		trimmed.startsWith("#") ||
		trimmed.startsWith("-") ||
		trimmed.startsWith("*") ||
		trimmed.startsWith("|") ||
		trimmed.startsWith(">") ||
		trimmed.startsWith("```")
	);
}

function isNoiseLine(trimmed: string, repeatedCount: number): boolean {
	if (!trimmed) {
		return false;
	}
	if (isStructuralLine(trimmed)) {
		return false;
	}
	if (/^(page\s+\d+|\d+)$/i.test(trimmed)) {
		return true;
	}
	if (
		repeatedCount >= 3 &&
		trimmed.length <= 80 &&
		(/^[A-Z0-9 '&:.,-]{4,}$/.test(trimmed) ||
			/^copyright\b/i.test(trimmed) ||
			/^all rights reserved\b/i.test(trimmed) ||
			/^isbn\b/i.test(trimmed))
	) {
		return true;
	}
	if (/^(printed in|publisher|www\.|http:\/\/|https:\/\/)/i.test(trimmed)) {
		return true;
	}
	return false;
}

function stripNoise(raw: string): string {
	const normalized = toNormalizedText(raw);
	const lines = normalized.split("\n");
	const counts = new Map<string, number>();
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
	}

	return lines
		.filter((line) => {
			const trimmed = line.trim();
			return !isNoiseLine(trimmed, counts.get(trimmed) ?? 0);
		})
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function parseHeadings(lines: string[]): Heading[] {
	const headings: Heading[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line ?? "");
		if (!match) {
			continue;
		}
		const title = match[2]?.trim().replace(/\s+#*$/, "") ?? "";
		if (!title) {
			continue;
		}
		headings.push({
			level: match[1]?.length ?? 1,
			title,
			lineIndex: index,
		});
	}
	return headings;
}

function chooseSplitLevel(headings: Heading[]): number {
	const counts = new Map<number, number>();
	for (const heading of headings) {
		counts.set(heading.level, (counts.get(heading.level) ?? 0) + 1);
	}
	if ((counts.get(1) ?? 0) > 1) {
		return 1;
	}
	for (let level = 2; level <= 6; level += 1) {
		if ((counts.get(level) ?? 0) > 0) {
			return level;
		}
	}
	return 1;
}

function trimSectionBody(raw: string): string {
	return raw.replace(/^\s+|\s+$/g, "");
}

function deriveSections(raw: string, fallbackTitle: string): RawSection[] {
	const cleaned = stripNoise(raw);
	const lines = cleaned.split("\n");
	const headings = parseHeadings(lines);
	if (headings.length === 0) {
		return [
			{
				title: fallbackTitle,
				parentHeading: null,
				body: cleaned,
			},
		];
	}

	const documentTitle =
		headings.find((heading) => heading.level === 1)?.title ?? fallbackTitle;
	const splitLevel = chooseSplitLevel(headings);
	const stack: Heading[] = [];
	const splitHeadings: Array<Heading & { parentHeading: string | null }> = [];

	for (const heading of headings) {
		while (stack.length > 0 && (stack.at(-1)?.level ?? 99) >= heading.level) {
			stack.pop();
		}
		if (heading.level === splitLevel) {
			splitHeadings.push({
				...heading,
				parentHeading:
					stack.at(-1)?.title ??
					(splitLevel > 1 && documentTitle !== heading.title
						? documentTitle
						: null),
			});
		}
		if (heading.level < splitLevel) {
			stack.push(heading);
		}
	}

	if (splitHeadings.length === 0) {
		return [
			{
				title: documentTitle,
				parentHeading: null,
				body: cleaned,
			},
		];
	}

	const firstSplit = splitHeadings[0];
	if (!firstSplit) {
		return [
			{
				title: documentTitle,
				parentHeading: null,
				body: cleaned,
			},
		];
	}
	const preambleStart =
		headings.find((heading) => heading.title === documentTitle)?.lineIndex ??
		-1;
	const preamble = trimSectionBody(
		lines
			.slice(Math.max(0, preambleStart + 1), firstSplit.lineIndex)
			.join("\n"),
	);
	const significantPreamble = preamble.length >= 120 ? preamble : null;
	const carriedPreamble =
		preamble.length > 0 && preamble.length < 120 ? preamble : null;

	const sections = splitHeadings.map((heading, index) => {
		const nextLine = splitHeadings[index + 1]?.lineIndex ?? lines.length;
		const rawBody = trimSectionBody(
			lines.slice(heading.lineIndex + 1, nextLine).join("\n"),
		);
		const prefix =
			index === 0 && carriedPreamble ? `${carriedPreamble}\n\n` : "";
		return {
			title: heading.title,
			parentHeading: heading.parentHeading,
			body: `${prefix}${rawBody}`.trim(),
		};
	});

	if (significantPreamble) {
		return [
			{
				title: "Introduction",
				parentHeading: documentTitle,
				body: significantPreamble,
			},
			...sections,
		];
	}

	return sections;
}

function toSlug(input: string): string {
	return (
		input
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.replace(/-{2,}/g, "-")
			.slice(0, 80) || "section"
	);
}

function detectTables(content: string): boolean {
	return (
		/^\|.+\|\s*$/m.test(content) &&
		/^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/m.test(content)
	);
}

function detectExamples(content: string): boolean {
	return /\bexample\b/i.test(content) || /\bfor example\b/i.test(content);
}

function detectExceptions(content: string): boolean {
	return (
		/\bexception\b/i.test(content) ||
		/\bunless\b/i.test(content) ||
		/\boverride\b/i.test(content)
	);
}

function sentenceSummary(content: string, fallbackTitle: string): string {
	const bodyLines = content
		.split("\n")
		.map((line) => line.trim())
		.filter(
			(line) =>
				line.length > 0 && !line.startsWith("#") && !line.startsWith("|"),
		);
	for (const line of bodyLines) {
		const sentence = line.match(/[^.!?]+[.!?]?/)?.[0]?.trim();
		if (sentence && sentence.length >= 24) {
			return sentence.slice(0, 180);
		}
	}
	return `${fallbackTitle} rules and procedures.`;
}

function extractKeywords(title: string, content: string): string[] {
	const counts = new Map<string, number>();
	const boost = (text: string, amount: number) => {
		for (const token of text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []) {
			if (STOP_WORDS.has(token)) {
				continue;
			}
			counts.set(token, (counts.get(token) ?? 0) + amount);
		}
	};
	boost(title, 3);
	boost(content, 1);
	return [...counts.entries()]
		.sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)
		.slice(0, 6)
		.map(([token]) => token);
}

function deriveDomainTags(title: string, content: string): string[] {
	const tags: string[] = [];
	for (const entry of TAG_PATTERNS) {
		if (tags.includes(entry.tag)) {
			continue;
		}
		if (entry.patterns.some((pattern) => pattern.test(title))) {
			tags.push(entry.tag);
		}
	}
	const haystack = `${title}\n${content}`;
	for (const entry of TAG_PATTERNS) {
		if (tags.includes(entry.tag)) {
			continue;
		}
		if (entry.patterns.some((pattern) => pattern.test(haystack))) {
			tags.push(entry.tag);
		}
	}
	return tags;
}

function deriveCrossReferences(
	content: string,
	titles: string[],
	ownTitle: string,
): string[] {
	const normalizedContent = content.toLowerCase();
	const matches = titles.filter((title) => {
		if (title === ownTitle) {
			return false;
		}
		return normalizedContent.includes(title.toLowerCase());
	});
	return [...new Set(matches)].slice(0, 5);
}

function limitTags(args: {
	domainTags: string[];
	hasTables: boolean;
	hasExamples: boolean;
	hasExceptions: boolean;
}): string[] {
	const tags =
		args.domainTags.length > 0 ? [...args.domainTags] : ["core-concepts"];
	for (const extra of [
		args.hasTables ? "table" : null,
		args.hasExamples ? "example" : null,
		args.hasExceptions ? "exception" : null,
	]) {
		if (!extra || tags.includes(extra) || tags.length >= 5) {
			continue;
		}
		tags.push(extra);
	}
	return tags.slice(0, 5);
}

function deriveTrackingProfile(entries: SectionIndexEntry[]): TrackingProfile {
	const tagSet = new Set(entries.flatMap((entry) => entry.tags));
	const strong = [
		tagSet.has("faction") ? "factions" : null,
		tagSet.has("reputation") || tagSet.has("social") ? "relationships" : null,
		tagSet.has("law") || tagSet.has("religion") || tagSet.has("economy")
			? "politics"
			: null,
		tagSet.has("travel") || tagSet.has("survival") ? "travel" : null,
		tagSet.has("downtime") ? "downtime" : null,
		tagSet.has("world") || tagSet.has("location") || tagSet.has("settlement")
			? "persistent-world-state"
			: null,
	].filter((value): value is string => Boolean(value));
	const light = [
		tagSet.has("combat") ? "combat-positioning" : null,
		tagSet.has("inventory") || tagSet.has("equipment") ? "equipment" : null,
		tagSet.has("magic") || tagSet.has("spell") ? "powers-and-spells" : null,
	].filter((value): value is string => Boolean(value));
	const minimal = [
		!tagSet.has("quest") ? "quest-ledgers" : null,
		!tagSet.has("npc") ? "npc-rosters" : null,
	].filter((value): value is string => Boolean(value));
	return {
		strong: [...new Set(strong)],
		light: [...new Set(light)],
		minimal: [...new Set(minimal)],
	};
}

function inferSimulationProfile(entries: SectionIndexEntry[]): {
	recommendedSimulationDepth: "light" | "standard" | "deep";
	profile: RulebookBootstrapResult["simulationProfile"];
} {
	const tagCounts = new Map<string, number>();
	for (const entry of entries) {
		for (const tag of entry.tags) {
			tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
		}
	}

	const worldWeight =
		(tagCounts.get("faction") ?? 0) +
		(tagCounts.get("reputation") ?? 0) +
		(tagCounts.get("travel") ?? 0) +
		(tagCounts.get("downtime") ?? 0) +
		(tagCounts.get("world") ?? 0) +
		(tagCounts.get("location") ?? 0) +
		(tagCounts.get("settlement") ?? 0) +
		(tagCounts.get("law") ?? 0) +
		(tagCounts.get("religion") ?? 0) +
		(tagCounts.get("economy") ?? 0);
	const tacticalWeight =
		(tagCounts.get("combat") ?? 0) +
		(tagCounts.get("attack") ?? 0) +
		(tagCounts.get("damage") ?? 0) +
		(tagCounts.get("initiative") ?? 0) +
		(tagCounts.get("defense") ?? 0);
	const narrativeWeight =
		(tagCounts.get("social") ?? 0) +
		(tagCounts.get("quest") ?? 0) +
		(tagCounts.get("npc") ?? 0);

	const tracking = deriveTrackingProfile(entries);
	const signals: string[] = [];
	let recommendedSimulationDepth: "light" | "standard" | "deep" = "standard";

	if (worldWeight >= 3 || tracking.strong.length >= 3) {
		recommendedSimulationDepth = "deep";
		signals.push("strong world-state and faction tracking signals detected");
	} else if (tacticalWeight >= 3 && worldWeight === 0 && narrativeWeight <= 1) {
		recommendedSimulationDepth = "light";
		signals.push("rules emphasis is mostly immediate action resolution");
	} else {
		signals.push(
			"signals are mixed or sparse, so bootstrap defaults to standard",
		);
	}

	const likelyGameSystemStructure =
		tacticalWeight >= 3 && worldWeight >= 2
			? "hybrid tactical campaign"
			: tacticalWeight >= 3
				? "combat-forward adventure game"
				: worldWeight >= 3
					? "campaign-state-forward adventure game"
					: "general tabletop campaign";
	const corePlayLoop =
		tacticalWeight >= worldWeight && tacticalWeight >= narrativeWeight
			? "scene -> action declaration -> mechanics resolution -> consequence"
			: worldWeight >= tacticalWeight
				? "travel or faction pressure -> scene play -> consequence tracking"
				: "scene framing -> social or investigative play -> consequence";

	return {
		recommendedSimulationDepth,
		profile: {
			likelyGameSystemStructure,
			corePlayLoop,
			tracking,
			signals,
		},
	};
}

function renderNormalizedSectionMarkdown(args: {
	title: string;
	summary: string;
	sourceRelativePath: string;
	parentHeading: string | null;
	tags: string[];
	keywords: string[];
	content: string;
}): string {
	const frontmatter = [
		"---",
		`title: "${args.title.replaceAll('"', '\\"')}"`,
		`description: "${args.summary.replaceAll('"', '\\"')}"`,
		`sourceRulebook: "${args.sourceRelativePath.replaceAll('"', '\\"')}"`,
		`tags: "${args.tags.join(", ")}"`,
		`keywords: "${args.keywords.join(", ")}"`,
		...(args.parentHeading
			? [`parentHeading: "${args.parentHeading.replaceAll('"', '\\"')}"`]
			: []),
		"---",
		"",
	];
	return `${frontmatter.join("\n")}# ${args.title}\n\n${args.content.trim()}\n`;
}

async function clearManagedNormalizedOutputs(
	normalizedRoot: string,
): Promise<void> {
	const entries = await readdir(normalizedRoot, { withFileTypes: true }).catch(
		(error: unknown) => {
			if (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return [];
			}
			throw error;
		},
	);
	for (const entry of entries) {
		if (!entry.isFile()) {
			continue;
		}
		if (
			(entry.name.endsWith(".md") && /^\d{2}-/.test(entry.name)) ||
			entry.name === "index.json"
		) {
			await rm(path.join(normalizedRoot, entry.name), { force: true });
		}
	}
}

export async function bootstrapImportedRulebook(args: {
	bardoRoot: string;
	sourceRelativePath: string;
	nowIso: string;
}): Promise<RulebookBootstrapResult> {
	const sourcePath = path.join(args.bardoRoot, args.sourceRelativePath);
	const raw = await readFile(sourcePath, "utf8");
	const fallbackTitle = path.basename(
		args.sourceRelativePath,
		path.extname(args.sourceRelativePath),
	);
	const rawSections = deriveSections(raw, fallbackTitle);
	const titles = rawSections.map((section) => section.title);
	const normalizedRoot = path.join(args.bardoRoot, NORMALIZED_RULES_DIR);
	await mkdir(normalizedRoot, { recursive: true });
	await clearManagedNormalizedOutputs(normalizedRoot);

	const sections: SectionIndexEntry[] = [];
	for (const [index, section] of rawSections.entries()) {
		const hasTables = detectTables(section.body);
		const hasExamples = detectExamples(section.body);
		const hasExceptions = detectExceptions(section.body);
		const keywords = extractKeywords(section.title, section.body);
		const domainTags = deriveDomainTags(section.title, section.body);
		const tags = limitTags({
			domainTags,
			hasTables,
			hasExamples,
			hasExceptions,
		});
		const filename = `${String(index + 1).padStart(2, "0")}-${toSlug(section.title)}.md`;
		const summary = sentenceSummary(section.body, section.title);
		const crossReferences = deriveCrossReferences(
			section.body,
			titles,
			section.title,
		);
		const entry: SectionIndexEntry = {
			order: index + 1,
			title: section.title,
			filename,
			summary,
			tags,
			keywords,
			hasTables,
			hasExamples,
			hasExceptions,
			...(section.parentHeading
				? { parentHeading: section.parentHeading }
				: {}),
			...(crossReferences.length > 0 ? { crossReferences } : {}),
		};
		sections.push(entry);
		await writeTextAtomic(
			path.join(normalizedRoot, filename),
			renderNormalizedSectionMarkdown({
				title: section.title,
				summary,
				sourceRelativePath: args.sourceRelativePath,
				parentHeading: section.parentHeading,
				tags,
				keywords,
				content: section.body,
			}),
		);
	}

	const simulationInference = inferSimulationProfile(sections);
	const result: RulebookBootstrapResult = {
		version: RULES_BOOTSTRAP_VERSION,
		sourceRelativePath: args.sourceRelativePath,
		sourceHash: sha256(raw),
		sectionCount: sections.length,
		indexPath: INDEX_RELATIVE_PATH,
		normalizedDirectory: NORMALIZED_RULES_DIR,
		recommendedSimulationDepth: simulationInference.recommendedSimulationDepth,
		simulationProfile: simulationInference.profile,
	};

	await writeTextAtomic(
		path.join(args.bardoRoot, INDEX_RELATIVE_PATH),
		JSON.stringify(
			{
				version: RULES_BOOTSTRAP_VERSION,
				generatedAtISO: args.nowIso,
				sourceRulebook: args.sourceRelativePath,
				sourceHash: result.sourceHash,
				normalizedDirectory: NORMALIZED_RULES_DIR,
				recommendedSimulationDepth: result.recommendedSimulationDepth,
				likelyGameSystemStructure:
					result.simulationProfile.likelyGameSystemStructure,
				corePlayLoop: result.simulationProfile.corePlayLoop,
				tracking: result.simulationProfile.tracking,
				simulationSignals: result.simulationProfile.signals,
				sections,
			},
			null,
			2,
		),
	);

	return result;
}
