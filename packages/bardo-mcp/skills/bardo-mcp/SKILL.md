---
name: bardo-mcp
description: Guides an MCP-capable agent using Bardo safely for local-first tabletop campaign preparation and play. Use when a user asks to set up, inspect, troubleshoot, or run Bardo MCP in a campaign workspace.
---

# Bardo MCP Skill

Use Bardo as a local-first campaign runtime. Keep campaign truth grounded in the workspace and `.bardo/` artifacts, not in loose chat memory.

## Safe Workflow

1. Confirm the user is in the campaign workspace.
2. Ask the user to install Bardo if the `bardo` command is missing.
3. Ask the user to run `bardo login` before client setup if account access is not configured.
4. Run or recommend `bardo init` before play if `.bardo/` is missing.
5. Start with workspace readiness before narrating or changing state.
6. Treat blocked readiness as a reason to ask for missing inputs, not a reason to invent canon.
7. Record explicit user corrections through Bardo so corrected truth outranks older inferred state.
8. Commit only validated state changes.

## Account Access

Bardo is free to download, but use requires active Bardo Pro access or the 3-day trial. Do not suggest bypassing account checks.

## Local-First Boundary

Campaign files, rulebook prep, current state, and committed canon should stay local. Bardo account services are for sign-in, browser approval, subscription or trial verification, token refresh, and account status.

## Useful Links

- Install: https://www.bardo.gg/docs/install
- Connect a client: https://www.bardo.gg/docs/connect-client
- MCP surface: https://www.bardo.gg/docs/mcp-surface
- Pricing and trial: https://www.bardo.gg/pricing
