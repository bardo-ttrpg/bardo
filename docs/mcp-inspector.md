# MCP Inspector

Bardo treats the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) as a bridge-debugging tool for the local-first runtime.

## Local development checklist

1. Start the website and bridge from the monorepo root:

```bash
bun run dev:all
```

2. Point `BARDO_CONFIG_DIR` at a clean-room workspace that already completed `bardo login`:

```bash
export BARDO_CONFIG_DIR="/home/armando/projects/02-bardo-test/.config/bardo"
```

3. If the config is missing, run the browser approval flow first:

```bash
cd /home/armando/projects/02-bardo-test
bardo login --start-url http://127.0.0.1:3001/api/connect/bridge-session/start
```

## Inspect the canonical client path

The canonical product path is the local bridge over stdio.

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

- `tools/list` should not expose a remote gameplay surface.
- The normal bridge session may show an intentionally minimal tool list.
- `BARDO_EXPOSE_BRIDGE_LOCAL_TOOLS=true` is the diagnostics-only escape hatch for inspecting the local runtime tools.
- Invalid tool inputs should return actionable MCP errors.
- If the script reports a missing config or missing bridge credential, point `BARDO_CONFIG_DIR` at the clean-room workspace that actually completed `bardo login`.
- If you omit the workspace argument, the script derives it from `BARDO_CONFIG_DIR` when that config lives under `<workspace>/.config/bardo`.
- `resources/list` and `prompts/list` returning `Method not found` is expected because Bardo currently exposes a tool-only MCP surface.

## Optional diagnostics-only local tool inspection

To inspect the local runtime tool surface directly during development:

```bash
BARDO_EXPOSE_BRIDGE_LOCAL_TOOLS=true \
BARDO_CONFIG_DIR="/home/armando/projects/02-bardo-test/.config/bardo" \
scripts/mcp-inspector-bridge.sh /home/armando/projects/02-bardo-test
```

Example invalid-input check:

```bash
BARDO_EXPOSE_BRIDGE_LOCAL_TOOLS=true \
MCP_INSPECTOR_METHOD=tools/call \
scripts/mcp-inspector-bridge.sh /home/armando/projects/02-bardo-test \
  --tool-name scene_turn
```

That should fail with a schema or input error because `scene_turn` requires a structured payload.

## Notes

- `.bardo/` remains the only managed workspace root.
- The bridge is the product path; direct HTTP gameplay inspection is retired.
- `bun run inspector:bridge` is the supported wrapper and expects `BARDO_CONFIG_DIR` to point at a real clean-room bridge login.
