# @bardo-ttrpg/mcp

Transparent local-first MCP server for Bardo.

`@bardo-ttrpg/mcp` exposes grounded tabletop campaign tools over stdio. It reads the current workspace and `.bardo/` artifacts through the local MCP connection. Local usage does not require a Bardo account or subscription.

## User Flow

1. Put your campaign notes and rulebook in one workspace folder.
2. Run `bardo init --rulebook ./RULEBOOK.md`.
3. Run `bardo validate`.
4. Run `bardo connect --client <codex|claude|opencode|gemini|cursor>`.
5. Open the client from the same workspace and ask it to check Bardo status.

If validation says the current location or active quest is missing, add a small campaign notes file. Large rulebooks are rules sources, not campaign notes.

## Tool Behavior

- `bardo_workspace_status` tells agents whether the workspace is initialized and ready.
- `init` imports the rulebook, writes `.bardo/`, and prepares local runtime artifacts.
- `scene_turn`, `player_action`, `world_sync`, and `user_correction` keep play grounded in local evidence.
- Diagnostic file tools stay hidden unless `BARDO_EXPOSE_LOCAL_TOOLS=true`.

The server should be started by an MCP client with:

```sh
bardo mcp serve --workspace-root .
```

## Development

```sh
pnpm build
pnpm test
pnpm mcp:inspect
```

Use `@bardo-ttrpg/cli` for the published `bardo` and `bardo-mcp` binaries.
