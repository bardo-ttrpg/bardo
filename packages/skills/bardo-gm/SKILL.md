---
name: bardo-gm
description: Guide an MCP-capable agent using Bardo as a grounded tabletop AI Game Master for local campaign preparation, play, corrections, and continuity.
---

# Bardo GM

Use Bardo as a local-first campaign runtime. Keep campaign truth grounded in the workspace and `.bardo/` artifacts, not in loose chat memory.

## Workflow

1. Confirm the user is in the campaign workspace.
2. Ask the user to install Bardo if the `bardo` command is missing.
3. Run or recommend `bardo init` before play if `.bardo/` is missing.
4. Start with readiness and current state before narrating or changing canon.
5. Treat missing readiness as a reason to ask for source material, not a reason to invent canon.
6. Use Bardo tools for explicit corrections so corrected truth outranks older inferred state.
7. Commit only validated state changes.

## Local Boundary

Local Bardo MCP and CLI use is free and open. Campaign files, rulebook prep, current state, sessions, and committed canon stay in the user's workspace. Paid Bardo services are for cloud campaign storage and hosted app integrations, not local file access.

## Useful Links

- Install: https://bardo.gg/docs/install
- Connect a client: https://bardo.gg/docs/connect-client
- MCP surface: https://bardo.gg/docs/mcp-surface
