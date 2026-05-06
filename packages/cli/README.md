# @bardo-ttrpg/cli

Command-line interface for local Bardo campaign workspaces and MCP setup.

## Install

```sh
pnpm add -g @bardo-ttrpg/cli
```

## First Run

From your campaign workspace:

```sh
bardo init --rulebook ./RULEBOOK.md
bardo validate
bardo connect --client opencode
bardo doctor
```

Use `--rulebook` when your rulebook is not named `rulebook.md`.

## Commands

- `bardo init`: imports rules and prepares `.bardo/`.
- `bardo validate`: prints readiness and missing campaign inputs.
- `bardo connect`: writes local MCP config for a supported client.
- `bardo doctor`: confirms local workspace and auth expectations.
- `bardo clients list`: prints supported client ids.
- `bardo mcp serve`: starts the local stdio MCP server.

Local use does not require sign-in, hosted URLs, bearer tokens, or API keys.
