import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DOCS_RELATIVE_PATHS = {
	quickstart: "docs/quickstart.md",
	worldState: "docs/how-to-read-your-world-state.md",
	reports: "docs/reports.md",
	codex: "docs/clients/codex.md",
	claudeCode: "docs/clients/claude-code.md",
	troubleshooting: "docs/troubleshooting.md",
	credits: "docs/credits-and-billing.md",
} as const;

export type LocalDocId = keyof typeof DOCS_RELATIVE_PATHS;

const LOCAL_DOC_ORDER = [
	"quickstart",
	"worldState",
	"reports",
	"codex",
	"claudeCode",
	"troubleshooting",
	"credits",
] as const satisfies readonly LocalDocId[];

function renderMarkdown(
	title: string,
	description: string,
	body: string,
): string {
	return (
		`---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(
			description,
		)}\n---\n\n${body}`.trimEnd() + "\n"
	);
}

function pathBullet(relativePath: string, note: string): string {
	return `- \`${relativePath}\` — ${note}`;
}

function buildDocContent(args: {
	docId: LocalDocId;
	workspaceRoot: string;
	bardoRoot: string;
}): string {
	const relativeBardoRoot =
		path.relative(args.workspaceRoot, args.bardoRoot) || ".";
	switch (args.docId) {
		case "quickstart":
			return renderMarkdown(
				"Bardo Quickstart",
				"Start a local-first Bardo campaign workspace and read the important files fast.",
				[
					"# Bardo Quickstart",
					"",
					"Bardo treats the local workspace as the source of truth. Your agent can help, but the table owns canon and the files stay readable.",
					"",
					"## Start here",
					"",
					"- Install the CLI with the command from `bardo.gg`.",
					"- Run `bardo login` if you are using a hosted key.",
					"- Run `bardo init` from your campaign workspace root.",
					"- Run `bardo connect --client codex` or your preferred client.",
					"- Read the files below before asking the agent to continue play.",
					"",
					"## Important files",
					"",
					pathBullet(
						"manifest.json",
						"Workspace metadata and the current ruleset.",
					),
					pathBullet(
						"projections/current-state.md",
						"Primary canon-derived state snapshot.",
					),
					pathBullet(
						"state/current.md",
						"Legacy-compatible mirror of the current state.",
					),
					pathBullet("events/canonical.ndjson", "Append-only canon log."),
					pathBullet(
						"logs/world-state-overview.md",
						"Readable continuity summary.",
					),
					pathBullet(
						"docs/how-to-read-your-world-state.md",
						"Guide to the files that matter most.",
					),
					"",
					"## Layout note",
					"",
					`This workspace uses the nested Bardo root at \`${relativeBardoRoot}\`.`,
				].join("\n"),
			);
		case "worldState":
			return renderMarkdown(
				"How To Read Your World State",
				"Guide to the canonical files and projections inside the Bardo workspace.",
				[
					"# How To Read Your World State",
					"",
					"Read these files in this order when you want the current truth quickly:",
					"",
					pathBullet(
						"projections/current-state.md",
						"Best current summary of canon-backed state.",
					),
					pathBullet(
						"events/canonical.ndjson",
						"Detailed source-of-truth event log.",
					),
					pathBullet(
						"state/current.md",
						"Compatibility mirror for tools that still expect the legacy path.",
					),
					pathBullet("logs/timeline-diff.md", "What changed recently."),
					pathBullet(
						"logs/continuity-audit.md",
						"Contradictions, drift, and stale continuity warnings.",
					),
					"",
					"## Canon vs inference",
					"",
					"- `Canon` sections are supported by canonical events or explicit saved state.",
					"- `Inference` sections are derived from canon and should be treated as reviewable conclusions.",
					"- `Suggestion` sections are optional ideas and are not canon until captured in future canonical events.",
				].join("\n"),
			);
		case "reports":
			return renderMarkdown(
				"Workspace Reports",
				"Reference for the generated markdown reports under logs/.",
				[
					"# Workspace Reports",
					"",
					"These reports are regenerated automatically when projections refresh after meaningful world-state changes.",
					"",
					pathBullet(
						"logs/world-state-overview.md",
						"High-level continuity view of place, time, tension, and active focus.",
					),
					pathBullet(
						"logs/continuity-audit.md",
						"Flags contradictions, stale continuity, and projection drift signals.",
					),
					pathBullet(
						"logs/timeline-diff.md",
						"Shows what changed since the recent canonical window.",
					),
					pathBullet(
						"logs/faction-pressure.md",
						"Summarizes faction tension and pressure.",
					),
					pathBullet(
						"logs/npc-state-delta.md",
						"Explains who changed and what evidence backs it.",
					),
					pathBullet(
						"logs/player-knowledge.md",
						"Player-safe view that keeps GM-only inference separate.",
					),
					pathBullet(
						"logs/canon-vs-inference.md",
						"Explicit separation of fact, inference, and suggestion.",
					),
					"",
					"## MCP access",
					"",
					"- Read these files directly in the workspace.",
					"- Or ask your MCP client for the matching report resource, such as `resource://reports/world-state-overview` or `resource://reports/last-session-diff`.",
					"- Or call the matching report tool when you want a forced refresh.",
					"- For the clearest recent-change workflow, call `last_session_diff` or read `resource://reports/last-session-diff`.",
				].join("\n"),
			);
		case "codex":
			return renderMarkdown(
				"Codex Client Setup",
				"How to connect Codex to this workspace and where to read Bardo outputs.",
				[
					"# Codex Client Setup",
					"",
					"- Run `bardo connect --client codex` from the workspace root.",
					"- This writes `.codex/config.toml` and points Codex at the local Bardo server.",
					"- Use `bardo doctor --json` if the connection looks suspicious.",
					"",
					"## Good first reads",
					"",
					pathBullet(
						"projections/current-state.md",
						"Read this before asking for scene continuation.",
					),
					pathBullet("logs/world-state-overview.md", "Quick state summary."),
					pathBullet(
						"logs/continuity-audit.md",
						"Use when the campaign feels contradictory or stale.",
					),
				].join("\n"),
			);
		case "claudeCode":
			return renderMarkdown(
				"Claude Code Client Setup",
				"How to connect Claude Code to this workspace and inspect Bardo state safely.",
				[
					"# Claude Code Client Setup",
					"",
					"- Run `bardo connect --client claude` from the workspace root.",
					"- Confirm the MCP server entry points at the local Bardo adapter.",
					"- Keep the workspace root unchanged so file-relative prompts stay stable.",
					"",
					"## Recommended workflow",
					"",
					"- Read `projections/current-state.md` first.",
					"- Use report resources for quick continuity checks.",
					"- Only promote new lasting facts into canon through canonical tool flows.",
				].join("\n"),
			);
		case "troubleshooting":
			return renderMarkdown(
				"Troubleshooting",
				"Common Bardo workspace and connection issues.",
				[
					"# Troubleshooting",
					"",
					"## `bardo doctor --json` says the workspace is not initialized",
					"",
					"- Run `bardo init` again from the intended workspace root.",
					"- Confirm `manifest.json` exists under `bardo/`.",
					"",
					"## The agent forgot something important",
					"",
					"- Read `events/canonical.ndjson` and `logs/continuity-audit.md`.",
					"- Regenerate or re-read the report resources before continuing play.",
					"",
					"## Credits do not look right",
					"",
					"- Only accepted MCP `tools/call` requests consume credits.",
					"- Resource reads, prompts, init/bootstrap, and dashboard browsing do not consume credits.",
				].join("\n"),
			);
		case "credits":
			return renderMarkdown(
				"Credits And Billing",
				"Simple flat credit model for hosted Bardo usage.",
				[
					"# Credits And Billing",
					"",
					"Bardo uses one billing rule:",
					"",
					"- `1 accepted MCP tool call = 1 credit`",
					"",
					"## What is free",
					"",
					"- `initialize`",
					"- MCP resources",
					"- MCP prompts",
					"- auth and dashboard activity",
					"- website browsing",
					"",
					"## What is billed",
					"",
					"- accepted MCP `tools/call` requests only",
					"- a high-level tool like `scene_turn` still costs exactly one credit",
					"- if a tool is accepted and later fails, the credit is still consumed",
					"",
					"## Where to check it",
					"",
					"- Website dashboard: remaining credits and next reset",
					"- `bardo doctor --json`: account and plan visibility",
				].join("\n"),
			);
	}

	const unreachable: never = args.docId;
	throw new Error(`Unsupported local doc id: ${String(unreachable)}`);
}

async function ensureFile(filePath: string, content: string): Promise<void> {
	try {
		await access(filePath);
	} catch {
		await mkdir(path.dirname(filePath), { recursive: true });
		await writeFile(filePath, content, "utf8");
	}
}

export async function ensureWorkspaceLocalDocs(args: {
	bardoRoot: string;
	workspaceRoot: string;
}): Promise<string[]> {
	const created: string[] = [];

	for (const docId of LOCAL_DOC_ORDER) {
		const filePath = path.join(args.bardoRoot, DOCS_RELATIVE_PATHS[docId]);
		try {
			await access(filePath);
		} catch {
			created.push(filePath);
		}
		await ensureFile(
			filePath,
			buildDocContent({
				docId,
				workspaceRoot: args.workspaceRoot,
				bardoRoot: args.bardoRoot,
			}),
		);
	}

	return created;
}
