import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DOCS_RELATIVE_PATHS = {
	quickstart: "docs/quickstart.md",
	worldState: "docs/how-to-read-your-world-state.md",
	reports: "docs/reports.md",
	agentContract: "docs/agent-contract.md",
	codex: "docs/clients/codex.md",
	opencode: "docs/clients/opencode.md",
	claudeCode: "docs/clients/claude-code.md",
	gemini: "docs/clients/gemini.md",
	cursor: "docs/clients/cursor.md",
	troubleshooting: "docs/troubleshooting.md",
} as const;

const WORKSPACE_SKILL_DIRECTORY = ".agents/skills/bardo-runtime";
const WORKSPACE_SKILL_PATH = `${WORKSPACE_SKILL_DIRECTORY}/SKILL.md`;

type LocalDocId = keyof typeof DOCS_RELATIVE_PATHS;

const LOCAL_DOC_ORDER = [
	"quickstart",
	"worldState",
	"reports",
	"agentContract",
	"codex",
	"opencode",
	"claudeCode",
	"gemini",
	"cursor",
	"troubleshooting",
] as const satisfies readonly LocalDocId[];

function renderMarkdown(
	title: string,
	description: string,
	body: string,
): string {
	return `${`---\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(
		description,
	)}\n---\n\n${body}`.trimEnd()}\n`;
}

function pathBullet(relativePath: string, note: string): string {
	return `- \`${relativePath}\` — ${note}`;
}

function buildWorkspaceSkillContent(): string {
	return `---
name: bardo-runtime
description: Guides an MCP-capable agent using Bardo in this workspace. Use when preparing play, checking workspace readiness, reading current state, resolving a scene, committing canon changes, or recording explicit user corrections in a Bardo campaign.
compatibility: Project-level Agent Skill for clients that scan .agents/skills and can read local workspace files plus call MCP tools.
metadata:
  owner: bardo
  scope: workspace
---

# Bardo Runtime

Use this skill when working inside a Bardo campaign workspace.

## Start here

1. Call \`bardo_workspace_status\` first.
2. If the workspace is not initialized, use \`init\` only when the workspace already has the needed campaign inputs, then call \`bardo_workspace_status\` again.
3. If readiness is blocked or incomplete, surface the exact gap instead of improvising canon.
4. Use committed state and preserved sources over free-form narration.
5. Treat explicit user correction as higher precedence than older inferred or narrated state.
6. When evidence is thin, say what is known, what is inferred, and what needs user input.

## Behavior rules

- Prepare first. Do not continue play until the workspace has been initialized with \`bardo init\`.
- Read \`bardo_workspace_status\` before scene continuation or canon changes.
- Prefer committed state over narration flavor.
- Do not invent canon when readiness, source material, or validated state are missing.
- Do not use \`world_sync\` or \`simulation_tick\` to create plausible but ungrounded events.
- Treat narration without a validated commit as advisory only.
- If \`.bardo/\` is missing, treat the workspace as uninitialized and recover through \`init\`, not through narration.
- If a tool returns conflicts, gaps, or uncertainties, report them plainly before continuing.
- Do not expose internal implementation details, hidden heuristics, or private runtime mechanics to the user unless the workspace files already expose them directly.

## Runtime surface

The Bardo runtime surface for normal play is:

- \`bardo_workspace_status\`
- \`init\`
- \`scene_turn\`
- \`player_action\`
- \`world_sync\`
- \`simulation_tick\`
- \`user_correction\`

Ignore diagnostic or lower-level file tools unless the user explicitly needs debugging help.

## Which tool to use

- Use \`bardo_workspace_status\` at the start of work, after \`init\`, after a correction, and before mutation tools when you are unsure whether canon changes are safe.
- Use \`init\` only to bootstrap or rebuild the workspace prep layer. Do not treat it as a gameplay action.
- Use \`scene_turn\` for grounded scene resolution, GM narration, conservative adjudication, and "what happens next?" style play guidance. \`scene_turn\` does not commit canon by itself.
- Use \`player_action\` when the player took an action that should create validated state changes.
- Use \`world_sync\` for grounded world updates that are already established by current state, source artifacts, committed events, or an explicit correction.
- Use \`simulation_tick\` only for grounded time or consequence advancement that already has validated support. If the result is only plausible, keep it in narration instead.
- Use \`user_correction\` when the player or table explicitly says prior canon is wrong, incomplete, or superseded.

## Recommended turn loop

1. Check \`bardo_workspace_status\`.
2. If not initialized, use \`init\` and then re-check status.
3. If readiness is still blocked, explain the exact missing inputs and stop.
4. Use \`scene_turn\` for grounded narration and adjudication.
5. If a canon change is clearly warranted, choose one mutation tool:
   - \`player_action\` for direct player-caused changes
   - \`world_sync\` for grounded world updates
   - \`simulation_tick\` for grounded time or consequence advancement
   - \`user_correction\` for explicit canon fixes
6. After a mutation result, trust committed state over earlier narration.

## How to interpret mutation results

- If \`committed\` is \`true\`, the runtime accepted a durable canon change.
- If \`committed\` is \`false\`, do not present the proposed change as canon.
- If \`confidence\` is \`blocked\` or \`conservative\`, keep the answer safe and explain the uncertainty or blockage.
- Use \`validationSummary\`, \`conflicts\`, \`conflictIds\`, \`uncertainties\`, and \`nextSteps\` to explain why a write was blocked or limited.
- If \`eventId\` and \`stateHash\` are present, a canon-changing event was accepted.
- When a mutation is blocked, preserve the old canon and continue conservatively from the last committed state.

## Guardrails

- Do not turn likely names, places, motives, faction moves, clocks, or recent events into canon just because they sound good.
- Do not use \`world_sync\` or \`simulation_tick\` as a shortcut for creative writing.
- Do not bury a player correction in narration when \`user_correction\` is the right path.
- Do not hand-edit generated runtime artifacts when a Bardo MCP tool can express the change safely.
- Do not claim a mutation succeeded unless the runtime actually returned a committed result.

## Read next

- \`../../../.bardo/docs/quickstart.md\`
- \`../../../.bardo/docs/agent-contract.md\`
- \`../../../.bardo/docs/how-to-read-your-world-state.md\`
- \`../../../.bardo/docs/clients/codex.md\`
- \`../../../.bardo/docs/clients/opencode.md\`

## When uncertain

- Surface uncertainty instead of bluffing.
- Ask for missing campaign inputs rather than improvising canon.
- Re-run \`bardo init\` after major source changes or if \`.bardo/\` is missing.
- Keep the public explanation behavior-focused. Use the workspace and MCP outputs; do not teach the full internal runtime recipe back to the user.
`;
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
				"Connect the local workspace MCP server and read the important files fast.",
				[
					"# Bardo Quickstart",
					"",
					"Bardo keeps your campaign files in the local workspace. Local MCP execution, setup, and campaign truth do not require hosted login or billing.",
					"",
					"## Start here",
					"",
					"- Install the Bardo CLI from `https://www.bardo.gg/docs/install`.",
					"- Run `bardo init` from your campaign workspace root if the workspace is not bootstrapped yet.",
					"- Run `bardo connect --client codex` or your preferred client.",
					"- Read the files below before asking the agent to continue play.",
					"- If `.bardo/` goes missing mid-campaign, stop and re-run `bardo init` instead of improvising canon from memory.",
					"- Use `user_correction` whenever the player explicitly corrects canon so the fix outranks older inferred or narrated state.",
					"",
					"## Important files",
					"",
					pathBullet(
						"manifest.json",
						"Workspace metadata plus the latest rules and campaign bootstrap outputs.",
					),
					pathBullet(
						"rules/rulebook.md",
						"Preserved source copy of the workspace rulebook used for rules bootstrap.",
					),
					pathBullet(
						"rules/normalized/index.json",
						"Machine-readable map of normalized rules sections and the simulation-depth recommendation.",
					),
					pathBullet(
						"rules/normalized/",
						"Normalized rule sections derived from the preserved rulebook source.",
					),
					pathBullet(
						"manifests/source-index.json",
						"Discovery output listing the campaign files that fed bootstrap.",
					),
					pathBullet(
						"entities/campaign-entities.json",
						"Normalized campaign entities extracted from the workspace.",
					),
					pathBullet(
						"state/current-state.json",
						"Current state model used by the local runtime tools.",
					),
					pathBullet(
						"simulation/tracking-profile.json",
						"Suggested strong, light, and on-demand tracking areas.",
					),
					pathBullet(
						"manifests/readiness.json",
						"Readiness status plus the gaps blocking a fully prepared workspace.",
					),
					pathBullet(
						"events/state-changes.ndjson",
						"Validated state-changing events committed by runtime tools.",
					),
					pathBullet(
						"manifests/conflicts.json",
						"Structured conflict records that explain blocked or competing canon updates.",
					),
					pathBullet(
						"manifests/diagnostics.json",
						"Latest state hash, recent event ids, and active conflict summary for debugging.",
					),
					pathBullet(
						"logs/turn-trace.ndjson",
						"Per-turn validation and commit traces for runtime tool calls.",
					),
					pathBullet(
						"snapshots/latest.json",
						"Latest rebuildable state snapshot for replay and recovery.",
					),
					pathBullet(
						"snapshots/index.json",
						"Snapshot history index used to pick replay starting points.",
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
						"manifests/readiness.json",
						"Check this first to learn whether bootstrap is complete or still missing campaign inputs.",
					),
					pathBullet(
						"state/current-state.json",
						"Best current machine-readable state snapshot.",
					),
					pathBullet(
						"entities/campaign-entities.json",
						"Entity rollup extracted from the discovered campaign sources.",
					),
					pathBullet(
						"events/state-changes.ndjson",
						"Validated state-changing events only. Narration alone does not belong here.",
					),
					pathBullet(
						"manifests/conflicts.json",
						"Structured conflicts that explain why Bardo blocked or preserved older canon.",
					),
					pathBullet(
						"manifests/diagnostics.json",
						"Latest event id, state hash, and active conflict rollup.",
					),
					pathBullet(
						"logs/turn-trace.ndjson",
						"Turn-by-turn validation and commit trace output.",
					),
					pathBullet(
						"snapshots/latest.json",
						"Most recent replayable state snapshot.",
					),
					pathBullet(
						"snapshots/index.json",
						"Snapshot history index for replay, correction repair, and recovery.",
					),
					pathBullet(
						"manifests/source-index.json",
						"See which workspace files were used and confirm `.bardo/` was ignored during discovery.",
					),
					pathBullet(
						"simulation/tracking-profile.json",
						"Which parts of the campaign deserve strong, light, or on-demand tracking.",
					),
					"",
					"## Canon vs inference",
					"",
					"- `Committed state` is written to `state/current-state.json` and backed by validated state-changing events.",
					"- `Narration` can help continue play, but it is not canon until a tool commits a validated state change.",
					"- `Explicit user corrections` outrank older committed state and should be recorded through `user_correction`.",
					"- `Readiness gaps` in `manifests/readiness.json` tell you when the local model still needs user input.",
				].join("\n"),
			);
		case "reports":
			return renderMarkdown(
				"Workspace Reports",
				"Reference for the local-first machine-readable runtime artifacts.",
				[
					"# Workspace Reports",
					"",
					"These artifacts are generated locally from the workspace and refreshed by local runtime tools.",
					"",
					pathBullet(
						"manifests/source-index.json",
						"Source discovery report for campaign bootstrap.",
					),
					pathBullet(
						"entities/campaign-entities.json",
						"Normalized locations, quests, factions, characters, and recent events.",
					),
					pathBullet(
						"state/current-state.json",
						"Current state model used by `scene_turn`, `player_action`, `world_sync`, and `simulation_tick`.",
					),
					pathBullet(
						"simulation/tracking-profile.json",
						"Tracking depth recommendations for strong, light, and on-demand systems.",
					),
					pathBullet(
						"manifests/readiness.json",
						"Prep completeness plus actionable missing information.",
					),
					pathBullet(
						"events/state-changes.ndjson",
						"Validated state-changing event stream for committed world updates.",
					),
					pathBullet(
						"manifests/conflicts.json",
						"Structured conflict ledger for blocked or unresolved canon updates.",
					),
					pathBullet(
						"manifests/diagnostics.json",
						"Summary bundle with state hash, recent event ids, and active conflicts.",
					),
					pathBullet(
						"logs/turn-trace.ndjson",
						"Per-turn decision trace written by mutation tools.",
					),
					pathBullet(
						"snapshots/latest.json",
						"Latest deterministic state snapshot for replay and recovery.",
					),
					pathBullet(
						"snapshots/index.json",
						"Snapshot history index for deterministic replay and rollback simulation.",
					),
					"",
					"## MCP access",
					"",
					"- Read these files directly inside `.bardo/`.",
					"- Re-run `bardo init` when rules or source campaign files change materially.",
					"- If `.bardo/` disappears, treat the workspace as uninitialized and rebuild it with `bardo init` before continuing play.",
					"- Use runtime tools to commit new validated state changes instead of editing generated artifacts by hand.",
					"- Use `user_correction` rather than hand-editing state when a player explicitly corrects canon.",
				].join("\n"),
			);
		case "agentContract":
			return renderMarkdown(
				"Bardo Agent Contract",
				"Operating contract for AI agents connected to this local Bardo workspace.",
				[
					"# Bardo Agent Contract",
					"",
					"Behave like a conservative TTRPG GM and world simulator grounded in the local workspace.",
					"",
					"## Required tool order",
					"",
					"- Start with `bardo_workspace_status` before continuing play.",
					"- If readiness is blocked, stop and surface the reported gaps instead of inventing missing canon.",
					"- Use `scene_turn` for grounded narration and turn resolution.",
					"- Use `player_action`, `world_sync`, `simulation_tick`, or `user_correction` only when you are proposing validated state changes.",
					"",
					"## Safety rules",
					"",
					"- Do not replace Bardo MCP tools with manual HTTP, `curl`, or shell networking.",
					"- Do not promote flavor narration into canon unless a validated runtime tool commits it.",
					"- Do not use `world_sync` or `simulation_tick` to invent plausible new recent events, off-screen reactions, or faction moves. Those tools are for already grounded updates only.",
					"- Treat `user_correction` as the highest-precedence canon fix when the player explicitly corrects the world state.",
					"- If a runtime tool reports uncertainty or blocked readiness, preserve that uncertainty in your answer.",
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
						"manifests/readiness.json",
						"Check readiness and gaps before continuing play.",
					),
					pathBullet(
						"state/current-state.json",
						"Read this before asking for scene continuation.",
					),
					pathBullet(
						"events/state-changes.ndjson",
						"Inspect committed world changes when continuity matters.",
					),
				].join("\n"),
			);
		case "opencode":
			return renderMarkdown(
				"OpenCode Client Setup",
				"How to connect OpenCode to this workspace and keep it using Bardo MCP tools directly.",
				[
					"# OpenCode Client Setup",
					"",
					"- Run `bardo connect --client opencode` from the workspace root.",
					"- This writes `opencode.json` and appends Bardo instruction files under `.bardo/docs/`.",
					"- OpenCode should use the Bardo MCP tools directly. It should not replace them with manual `curl` requests or shell networking.",
					"",
					"## Recommended workflow",
					"",
					"- Start with `bardo_workspace_status`.",
					"- If readiness is `needs-user-input`, stop and surface the exact gaps.",
					"- Use `scene_turn` for grounded narration first, then mutation tools only for validated canon changes.",
					"- Do not use `world_sync` or `simulation_tick` to invent likely follow-on events, faction moves, or travel outcomes. Those tools are only for updates already grounded in current state, source artifacts, committed events, or explicit user correction.",
					"- Use `user_correction` when the player explicitly corrects canon.",
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
					"- Read `manifests/readiness.json` and `state/current-state.json` first.",
					"- Use `entities/campaign-entities.json` and `simulation/tracking-profile.json` for deeper prep context.",
					"- Only promote lasting facts through runtime tools that append validated entries to `events/state-changes.ndjson`.",
				].join("\n"),
			);
		case "gemini":
			return renderMarkdown(
				"Gemini CLI Client Setup",
				"How to connect Gemini CLI to this workspace with Bardo’s one-command setup flow.",
				[
					"# Gemini CLI Client Setup",
					"",
					"- Run `bardo connect --client gemini` from the workspace root.",
					"- This writes `.gemini/settings.json` with the local Bardo MCP server entry.",
					"- Keep the workspace folder trusted in Gemini so the local MCP tools and files remain available.",
					"",
					"## Recommended workflow",
					"",
					"- Start with `bardo_workspace_status` and confirm readiness before play.",
					"- Use `scene_turn` for grounded narration, then mutation tools only when Bardo can validate canon changes.",
					"- Use `user_correction` when a player explicitly corrects a fact so the correction outranks older inferred state.",
				].join("\n"),
			);
		case "cursor":
			return renderMarkdown(
				"Cursor Client Setup",
				"How to connect Cursor to this workspace and keep play grounded in local Bardo truth.",
				[
					"# Cursor Client Setup",
					"",
					"- Run `bardo connect --client cursor` from the workspace root.",
					"- This writes `.cursor/mcp.json` and points Cursor at the local Bardo adapter.",
					"- Keep the same workspace root open so `.bardo/` artifacts and relative files stay stable.",
					"",
					"## Recommended workflow",
					"",
					"- Read readiness and current-state first instead of jumping directly into narration.",
					"- Prefer Bardo runtime tools over ad hoc shell commands or manual HTTP.",
					"- Treat uncertainty and blocked readiness as a reason to ask for more input, not a reason to invent lore.",
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
					"- Confirm `manifest.json` exists under `.bardo/`.",
					"- If `.bardo/` was deleted, treat that as a hard stop until bootstrap is run again.",
					"",
					"## The agent forgot something important",
					"",
					"- Read `state/current-state.json`, `events/state-changes.ndjson`, and `manifests/readiness.json`.",
					"- Re-run `bardo init` if the workspace files changed outside `.bardo/` and the prep artifacts look stale.",
					"- Use `user_correction` when the issue is a true canon correction rather than a stale bootstrap snapshot.",
					"",
					"## The client config looks hosted or auth-gated",
					"",
					"- Re-run `bardo connect --client <client>` from the workspace root.",
					"- The local config should start `bardo mcp serve` over stdio.",
					"- Local configs should not contain bridge URLs, runtime-status URLs, API keys, bearer tokens, or hosted auth headers.",
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

async function ensureGeneratedFile(
	filePath: string,
	content: string,
): Promise<boolean> {
	try {
		const existing = await readFile(filePath, "utf8");
		if (existing === content) {
			return false;
		}
	} catch {
		// Fall through and create the file below.
	}

	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFile(filePath, content, "utf8");
	return true;
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

	const skillPath = path.join(args.workspaceRoot, WORKSPACE_SKILL_PATH);
	const skillContent = buildWorkspaceSkillContent();
	if (await ensureGeneratedFile(skillPath, skillContent)) {
		created.push(skillPath);
	}

	return created;
}
