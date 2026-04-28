# Bardo MCP

Bardo MCP is a local-first Model Context Protocol server for grounded tabletop campaign play. It prepares a `.bardo/` workspace layer, lets MCP-capable clients inspect readiness and current state, and commits only validated canon changes or explicit user corrections.

Bardo is free to download. Use requires an active Bardo Pro subscription or the included 3-day trial for new users.

## Install

macOS and Linux:

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

Use the matching client name for your setup: `codex`, `opencode`, `claude`, `gemini`, `cursor`, `windsurf`, `vscode`, `kiro`, `kilo`, `trae`, or `auto`.

## Authentication and paid access

`bardo login` opens a browser approval flow. The hosted Bardo website handles sign-in, approval, billing, entitlements, token refresh, and account status. Campaign truth, workspace files, rulebook artifacts, and runtime state stay local.

Direct unauthenticated calls to approval routes return `401 Unauthorized` by design. Bardo fails closed if it cannot verify entitlement.

## MCP transport

Bardo publishes as a local `stdio` MCP server. It does not expose a hosted gameplay MCP endpoint in this release. Remote MCP publication will require standards-compliant Streamable HTTP and OAuth before it is listed as remote.

## Core tools

- `bardo_workspace_status`: inspect workspace readiness, current-state highlights, and mutation guardrails.
- `init`: prepare the `.bardo/` workspace layer from local rulebook and campaign inputs.
- `scene_turn`: resolve grounded narration without automatically promoting flavor into canon.
- `player_action`: commit validated state-changing player action results.
- `user_correction`: record explicit user corrections at highest canon precedence.
- `world_sync`: commit already-grounded world-state changes.
- `simulation_tick`: advance validated simulation state without inventing ungrounded events.

Diagnostic workspace tools are intentionally hidden by default unless explicitly enabled for debugging.

## Client examples

Cursor workspace config after `bardo connect --client cursor`:

```json
{
	"mcpServers": {
		"bardo": {
			"command": "bardo",
			"args": [
				"mcp",
				"serve"
			]
		}
	}
}
```

## Documentation

- Install guide: https://www.bardo.gg/docs/install
- Client connection guide: https://www.bardo.gg/docs/connect-client
- MCP surface: https://www.bardo.gg/docs/mcp-surface
- Pricing and trial: https://www.bardo.gg/pricing

## Registry identity

Official MCP Registry name: `io.github.armando-andre/bardo`

Public npm package: `@bardo/mcp`

Public listing repository: https://github.com/armando-andre/bardo-mcp
