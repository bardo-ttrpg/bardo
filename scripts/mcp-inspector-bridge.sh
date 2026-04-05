#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_DIR="${BARDO_CONFIG_DIR:-}"
MCP_URL="${BARDO_MCP_URL:-http://127.0.0.1:3000/mcp}"
METHOD="${MCP_INSPECTOR_METHOD:-tools/list}"
BRIDGE_COMMAND="${BARDO_BRIDGE_INSPECTOR_COMMAND:-}"

if [[ -z "$CONFIG_DIR" ]]; then
  if [[ -f "$WORKSPACE_ROOT/.config/bardo/config.json" ]]; then
    CONFIG_DIR="$WORKSPACE_ROOT/.config/bardo"
  else
    echo "Missing BARDO_CONFIG_DIR. Point it at a workspace that has completed 'bardo login', for example:" >&2
    echo "  export BARDO_CONFIG_DIR=/home/armando/projects/02-bardo-test/.config/bardo" >&2
    exit 1
  fi
fi

CONFIG_PATH="$CONFIG_DIR/config.json"
if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Bridge config not found at $CONFIG_PATH. Run 'bardo login' first or point BARDO_CONFIG_DIR at a clean-room workspace config." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for Inspector bridge validation." >&2
  exit 1
fi

python - <<'PY' "$CONFIG_PATH"
from pathlib import Path
import json
import sys

path = Path(sys.argv[1])
raw = path.read_text(encoding="utf-8")
normalized = raw
while normalized.endswith("\\n") or normalized.endswith("\\r"):
    normalized = normalized[:-2] if normalized.endswith("\\n") or normalized.endswith("\\r") else normalized
normalized = normalized.rstrip()
if normalized != raw:
    parsed = json.loads(normalized)
    path.write_text(json.dumps(parsed, indent=2) + "\n", encoding="utf-8")
PY

CONFIG_VERSION="$(jq -r '.version // 1' "$CONFIG_PATH")"
ACCESS_TOKEN="$(jq -r '.accessToken // .apiKey // empty' "$CONFIG_PATH")"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "No bridge credential found in $CONFIG_PATH. Re-run 'bardo login' before using MCP Inspector." >&2
  exit 1
fi

if [[ "$CONFIG_VERSION" != "2" ]]; then
  echo "Bridge Inspector requires a version 2 bridge-session config, but $CONFIG_PATH is version $CONFIG_VERSION." >&2
  echo "Re-run 'bardo login --start-url http://127.0.0.1:3001/api/connect/bridge-session/start' in the clean-room workspace before using Inspector." >&2
  exit 1
fi

WORKSPACE_ROOT="${BARDO_WORKSPACE_ROOT:-}"
EXTRA_ARGS=()
if [[ $# -gt 0 ]]; then
  if [[ "$1" == --* ]]; then
    EXTRA_ARGS=("$@")
  else
    WORKSPACE_ROOT="$1"
    shift
    EXTRA_ARGS=("$@")
  fi
fi

if [[ -z "$WORKSPACE_ROOT" && "$CONFIG_DIR" == */.config/bardo ]]; then
  WORKSPACE_ROOT="${CONFIG_DIR%/.config/bardo}"
fi
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$PWD}"

if [[ -z "$BRIDGE_COMMAND" ]]; then
  BRIDGE_COMMAND="env -u BARDO_ACCESS_TOKEN -u BARDO_API_KEY -u BARDO_MCP_URL bun run --cwd $REPO_ROOT/packages/bardo-mcp start --"
fi

echo "Inspecting the local Bardo bridge with config $CONFIG_PATH" >&2
echo "Workspace root: $WORKSPACE_ROOT" >&2
echo "Direct MCP URL: $MCP_URL" >&2
echo "Bridge command: $BRIDGE_COMMAND" >&2

exec npx -y @modelcontextprotocol/inspector \
  -e "BARDO_CONFIG_DIR=$CONFIG_DIR" \
  --cli bash -lc "$BRIDGE_COMMAND mcp serve --url \"$MCP_URL\" --workspace-root \"$WORKSPACE_ROOT\"" \
  --method "$METHOD" \
  "${EXTRA_ARGS[@]}"
