# Bardo MCP

Bardo MCP connects MCP-capable agents to a local tabletop campaign workspace. It helps the agent prepare campaign context, check whether play is ready to continue, and keep durable campaign truth grounded in local files instead of loose chat memory.

Bardo is free to download. Use requires an active Bardo Pro subscription or the included 3-day trial for new users.

## Who it is for

Bardo is for players, GMs, and AI-assisted campaign maintainers who want an agent to help with tabletop preparation and play while keeping campaign state local and auditable.

## Install

Linux and macOS:

```bash
curl -fsSL https://bardo.gg/install | sh
```

Windows PowerShell:

```powershell
irm https://bardo.gg/install.ps1 | iex
```

Then prepare a campaign workspace:

```bash
cd ~/projects/my-campaign
bardo login
bardo init
bardo connect --client cursor
```

## Authentication and paid access

`bardo login` opens a browser approval flow. Bardo account services handle sign-in, subscription or trial verification, browser approval, token refresh, and account status. Campaign truth, workspace files, rulebook artifacts, and runtime state stay local.

Direct unauthenticated calls to approval routes return `401 Unauthorized` by design. Bardo fails closed if it cannot verify account access.

## MCP transport

Bardo publishes as a local `stdio` MCP server. It does not expose a hosted gameplay MCP endpoint in this release. Remote MCP publication is intentionally deferred until Bardo supports standards-compliant Streamable HTTP authorization for remote MCP use.

## Capabilities

Bardo helps an MCP-capable agent:

- Check workspace readiness before play.
- Prepare local campaign artifacts from rulebook and campaign inputs.
- Resolve grounded scene turns.
- Record explicit user corrections when the table corrects a fact.
- Commit validated state changes without treating every narration as canon.

See [MCP surface docs](https://www.bardo.gg/docs/mcp-surface) for the current public tool behavior.

## Client support

| Client | Public status | Notes |
| --- | --- | --- |
| Codex | Supported, smoke required per release | Official MCP config support exists; Bardo writes Codex config. |
| OpenCode | Supported, smoke required per release | Official local MCP config support exists; Bardo writes OpenCode config. |
| Claude Code/Desktop | Supported, smoke required per release | Official project MCP config support exists; Bardo writes `.mcp.json`. |
| Gemini CLI | Supported, smoke required per release | Official MCP settings support exists; Bardo writes Gemini settings. |
| Cursor | Config-supported | Bardo writes Cursor MCP config; keep labeled this way until the current release is live-smoked in Cursor. |
| VS Code/GitHub Copilot | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Windsurf | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Kiro | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Kilo Code | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Trae | Experimental | Not publicly promoted until official docs and live smoke are verified. |

`auto` is a CLI convenience for detecting one existing supported config file. It is not a client.

## Documentation

- Install guide: https://www.bardo.gg/docs/install
- Client connection guide: https://www.bardo.gg/docs/connect-client
- MCP surface: https://www.bardo.gg/docs/mcp-surface
- Pricing and trial: https://www.bardo.gg/pricing
- Support: https://www.bardo.gg/docs

## Registry identity

- Official MCP Registry name: `io.github.armando-andre/bardo`
- Public npm package: `@bardo/mcp`
- Public listing repository: https://github.com/armando-andre/bardo-mcp
