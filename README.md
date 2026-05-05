# Bardo

Bardo turns MCP-capable AI clients and agents into grounded tabletop role-playing Game Masters.

The public repo is intentionally transparent. It contains the local runtime, MCP server, CLI, Agent Skill, public MDX docs, client setup examples, and marketplace metadata so users can inspect what Bardo reads, writes, and runs.

## What Is Public

- `@bardo-ttrpg/core`: `.bardo/` workspace schema, campaign grounding, runtime state, corrections, diagnostics, and validation.
- `@bardo-ttrpg/mcp`: local stdio MCP server exposing Bardo tools to supported clients.
- `@bardo-ttrpg/cli`: `bardo` and `bardo-mcp` commands for init, validation, client config, doctor checks, and server startup.
- `@bardo-ttrpg/docs`: public MDX documentation content.
- `@bardo-ttrpg/skills`: the `bardo-gm` Agent Skill.

## Local-First Model

Local Bardo use is free and open. The workspace is the source of truth, and `.bardo/` is the only Bardo-managed local folder. Cloud campaign storage and hosted ChatGPT/Claude integrations are paid SaaS features that live in the private `bardo-app` repo.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm check
```

Use `pnpm` and `pnpx` only. This repo does not use Bun, npm, npx, or Knip.

## Supported Local Clients

First-class setup targets are Codex, Codex CLI, Claude Code, OpenCode, Gemini CLI, and Cursor. Additional client examples are provided where the configuration format is compatible.

## License

MIT.
