# Bardo

Bardo turns MCP-capable AI clients and agents into grounded tabletop role-playing Game Masters.

Bardo is local-first: your campaign workspace is the source of truth, and `.bardo/` is the only Bardo-managed local folder.

## Quick Start

```sh
pnpm add -g @bardo-ttrpg/cli
cd path/to/your/campaign
bardo init --rulebook ./RULEBOOK.md
bardo validate
bardo connect --client opencode
```

Open your MCP-capable client from the same campaign folder. Ask it to check Bardo workspace status before continuing play.

## Who It Is For

- Game masters who want campaign tools that remember the right things.
- TTRPG groups that prefer durable notes, rules, and session state over fragile chat memory.
- Developers interested in local-first RPG tooling, Model Context Protocol servers, and AI-assisted campaign workflows.
- Contributors who want to help build a clear, safe, welcoming open-source TTRPG toolchain.

## Packages

- `@bardo-ttrpg/core`: `.bardo/` workspace schema, campaign grounding, runtime state, corrections, diagnostics, and validation.
- `@bardo-ttrpg/mcp`: local stdio MCP server exposing Bardo tools to supported clients.
- `@bardo-ttrpg/cli`: `bardo` and `bardo-mcp` commands for init, validation, client config, doctor checks, and server startup.
- `@bardo-ttrpg/docs`: public MDX documentation content.
- `@bardo-ttrpg/skills`: the `bardo-gm` Agent Skill.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check
```

Use `pnpm` and `pnpx` only. This repo does not use Bun, npm, npx, or Knip.

## Supported Local Clients

First-class setup targets are Codex, Claude Code, OpenCode, Gemini CLI, and Cursor. Generic MCP JSON is available for compatible clients.

The local MCP server runs over stdio:

```sh
bardo mcp serve --workspace-root .
```

Local use does not require a Bardo account, hosted bridge URL, bearer token, or API key.

## MCP Tools

Bardo exposes tools for workspace status, initialization, scene turns, player actions, world sync, corrections, diagnostics, and local docs. Agents should call `bardo_workspace_status` first, run `init` when `.bardo/` is missing, and avoid canon writes until readiness gaps are resolved.

## Contributing

Issues are for actionable work: bugs, features, docs, release tasks, and security-hardening tasks. Questions, ideas, showcases, playtesting stories, and general community conversation belong in GitHub Discussions.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then open an issue before starting larger work.

## Security

Please do not report vulnerabilities in public issues. Read [SECURITY.md](SECURITY.md) for the private reporting flow.

## License

Code in this repository is licensed under the [MIT License](LICENSE). Bardo names, branding, logos, lore, setting text, art, and other creative content are not granted under the MIT code license; see [CONTENT_LICENSE.md](CONTENT_LICENSE.md).
