# MCP Inspector

Bardo treats the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) as the primary protocol-debugging tool for V1.

## Local development checklist

1. Start the website and local MCP services from the monorepo root:

```bash
bun run dev:all
```

2. Use the same clean-room bridge config directory that completed `bardo login`:

```bash
export BARDO_CONFIG_DIR="/home/armando/projects/02-bardo-test/.config/bardo"
```

3. Log in through the canonical bridge flow if the config is empty:

```bash
cd /home/armando/projects/02-bardo-test
bardo login --start-url http://127.0.0.1:3001/api/connect/bridge-session/start
```

## Inspect the canonical client path

The canonical V1 client path is the local bridge over stdio.

```bash
BARDO_CONFIG_DIR="/home/armando/projects/02-bardo-test/.config/bardo" \
scripts/mcp-inspector-bridge.sh /home/armando/projects/02-bardo-test
```

This launches Inspector against:

```bash
bun run --cwd /home/armando/projects/bardo/packages/bardo-mcp start -- \
  mcp serve --url http://127.0.0.1:3000/mcp --workspace-root "/home/armando/projects/02-bardo-test"
```

### Bridge checklist

- `tools/list` should show the trusted-copilot Bardo tool surface for the current session, including the core story, mechanics, and planning tools.
- Bridge-local CRUD tools must be absent by default.
- Invalid tool inputs should return actionable MCP errors.
- Reconnect after token refresh should keep the bridge usable.
- If the script reports a missing config or missing bridge credential, point `BARDO_CONFIG_DIR` at the clean-room workspace that actually completed `bardo login`.
- If you omit the workspace argument, the script derives it from `BARDO_CONFIG_DIR` when that config lives under `<workspace>/.config/bardo`.
- `resources/list` and `prompts/list` currently returning `Method not found` is expected in V1 because Bardo intentionally exposes a tool-only MCP surface.

Example invalid-input check:

```bash
MCP_INSPECTOR_METHOD=tools/call \
scripts/mcp-inspector-bridge.sh /home/armando/projects/02-bardo-test \
  --tool-name scene_turn
```

That should fail with a schema/input error because `scene_turn` requires at least an `action`.

## Inspect the direct HTTP server

Use the direct HTTP MCP endpoint only for protocol debugging. This is not the canonical user path.

```bash
export BARDO_CONFIG_DIR="/home/armando/projects/02-bardo-test/.config/bardo"
scripts/mcp-inspector-remote.sh http://127.0.0.1:3000/mcp /home/armando/projects/02-bardo-test
```

The HTTP inspector script treats `BARDO_CONFIG_DIR/config.json` as the canonical bridge session when that config exists. It expects a version 2 bridge-session config, refreshes expired bridge credentials first, persists the refreshed bundle back into the clean-room config, and only falls back to `BARDO_ACCESS_TOKEN` or `BARDO_API_KEY` when you intentionally run it without a bridge config.
It also sends `x-bardo-workspace-root` so the direct HTTP path can validate the same local workspace the bridge would use.

### Direct HTTP checklist

- `tools/list` should show the same high-level tool surface as the bridge path.
- Tool descriptions and schemas should be discoverable and readable.
- Error responses should be stable and understandable.
- No local workspace CRUD assumptions should appear in the direct HTTP interface.
- `resources/list` and `prompts/list` returning `Method not found` is expected for the same reason as the bridge path: V1 is intentionally tool-only.

## Notes

- `BARDO_EXPOSE_BRIDGE_LOCAL_TOOLS=true` is a diagnostics-only escape hatch and should stay off for normal product verification.
- The direct HTTP inspector path requires a valid bearer token because the control plane is still subscription-gated.
- `bun run inspector:bridge` and `bun run inspector:remote` are thin wrappers around these scripts, so they also expect `BARDO_CONFIG_DIR` to point at a real clean-room bridge login.
