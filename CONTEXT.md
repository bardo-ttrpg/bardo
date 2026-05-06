# Bardo Public Repo Context

## Language

- Bardo: local-first tooling that turns MCP-capable AI clients into grounded tabletop role-playing Game Masters.
- Workspace: the user's campaign directory and the source of truth for local play.
- `.bardo/`: the canonical Bardo-managed local campaign state directory.
- MCP runtime: the stdio server that exposes grounded tools for readiness, rules, state, corrections, diagnostics, and safe state changes.
- Agent Skill: concise behavior guidance that keeps an AI client evidence-first inside a prepared workspace.
- Client adapter: generated local MCP configuration for Codex, Claude Code, OpenCode, Gemini CLI, Cursor, and compatible generic MCP clients.
- Marketplace metadata: public packaging notes for registries and client marketplaces.

## Relationships

- The workspace owns campaign truth; `.bardo/` stores Bardo-managed derivatives and committed state.
- The public repo owns transparent local tooling: core runtime, MCP server, CLI, docs content, skills, examples, and marketplace preparation.
- Local CLI and MCP use never require hosted login, billing, bridge sessions, or token refresh.
- Cloud campaign storage and hosted ChatGPT/Claude integrations belong in the private app repo.

## Example Dialogue

- User: "Can Bardo keep this campaign consistent in Codex?"
- Bardo: "Run `bardo init`, connect Codex to the local MCP server, then have Codex read readiness and current state before play."

## Flagged Ambiguities

- Live smoke coverage depends on which AI clients are installed locally.
- Runtime algorithm deepening is intentionally separate from docs and instruction polish.
