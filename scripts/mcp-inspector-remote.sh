#!/usr/bin/env bash
set -euo pipefail

MCP_URL="${BARDO_MCP_BASE_URL:-http://127.0.0.1:3000/mcp}"
CONFIG_DIR="${BARDO_CONFIG_DIR:-}"
METHOD="${MCP_INSPECTOR_METHOD:-tools/list}"
ACCESS_TOKEN=""
WORKSPACE_ROOT="${BARDO_WORKSPACE_ROOT:-}"
EXTRA_ARGS=()
REFRESH_ATTEMPTED=false
REFRESH_FAILED=false

if [[ $# -gt 0 ]]; then
  if [[ "$1" != --* ]]; then
    MCP_URL="$1"
    shift
  fi
  if [[ $# -gt 0 ]]; then
    if [[ "$1" == --* ]]; then
      EXTRA_ARGS=("$@")
    else
      WORKSPACE_ROOT="$1"
      shift
      EXTRA_ARGS=("$@")
    fi
  fi
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for Inspector remote validation." >&2
  exit 1
fi

sanitize_config_json() {
  local config_path="$1"
  python - <<'PY' "$config_path"
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
}

normalize_loopback_url() {
  python - "$1" "$2" <<'PY'
from urllib.parse import urlparse, urlunparse
import sys

url = sys.argv[1]
preferred_host = sys.argv[2]
loopback_hosts = {"localhost", "127.0.0.1", "::1"}

if not url or not preferred_host:
    print(url)
    raise SystemExit(0)

parsed = urlparse(url)
if parsed.hostname not in loopback_hosts or preferred_host not in loopback_hosts:
    print(url)
    raise SystemExit(0)

if parsed.hostname == preferred_host:
    print(url)
    raise SystemExit(0)

host = f"[{preferred_host}]" if ":" in preferred_host and not preferred_host.startswith("[") else preferred_host
netloc = f"{host}:{parsed.port}" if parsed.port else host
print(urlunparse(parsed._replace(netloc=netloc)))
PY
}

if [[ -z "$ACCESS_TOKEN" && -n "$CONFIG_DIR" && -f "$CONFIG_DIR/config.json" ]]; then
  CONFIG_PATH="$CONFIG_DIR/config.json"
  sanitize_config_json "$CONFIG_PATH"
  CONFIG_VERSION="$(jq -r '.version // empty' "$CONFIG_PATH")"
  EXPIRES_AT_ISO="$(jq -r '.expiresAtISO // empty' "$CONFIG_PATH")"
  if [[ "$CONFIG_VERSION" != "2" ]]; then
    echo "Remote Inspector expected a version 2 bridge-session config at $CONFIG_PATH, but found version ${CONFIG_VERSION:-1}." >&2
    echo "Re-run 'bardo login --start-url http://127.0.0.1:3001/api/connect/bridge-session/start' in the clean-room workspace before using Inspector." >&2
    exit 1
  fi
  MCP_HOST="$(python - <<'PY' "$CONFIG_PATH"
from urllib.parse import urlparse
import json, sys
config = json.load(open(sys.argv[1]))
url = config.get("url", "")
host = urlparse(url).hostname or ""
print(host)
PY
)"

  if [[ "$CONFIG_VERSION" == "2" ]]; then
    REFRESH_TOKEN="$(jq -r '.refreshToken // empty' "$CONFIG_PATH")"
    REFRESH_URL="$(jq -r '.refreshUrl // empty' "$CONFIG_PATH")"
    REFRESH_URL="$(normalize_loopback_url "$REFRESH_URL" "$MCP_HOST")"
    if [[ -n "$REFRESH_TOKEN" && -n "$REFRESH_URL" ]]; then
      REFRESH_ATTEMPTED=true
      REFRESH_PAYLOAD="$(jq -nc --arg refreshToken "$REFRESH_TOKEN" '{refreshToken: $refreshToken}')"
      REFRESH_RESPONSE="$(curl -fsSL -X POST "$REFRESH_URL" -H 'content-type: application/json' --data "$REFRESH_PAYLOAD" 2>/dev/null || true)"
      if [[ -n "$REFRESH_RESPONSE" ]]; then
        ACCESS_TOKEN="$(printf '%s' "$REFRESH_RESPONSE" | jq -r '.accessToken // empty')"
      else
        REFRESH_FAILED=true
      fi
    fi
  fi

  if [[ -z "$ACCESS_TOKEN" ]]; then
    ACCESS_TOKEN="$(jq -r '.accessToken // .apiKey // empty' "$CONFIG_PATH")"
  fi

  if [[ "$REFRESH_ATTEMPTED" == "true" && "$REFRESH_FAILED" == "false" && -n "${REFRESH_RESPONSE:-}" ]]; then
    python - <<'PY' "$CONFIG_PATH" "$REFRESH_RESPONSE"
import json, sys

config_path = sys.argv[1]
bundle = json.loads(sys.argv[2])

with open(config_path, "r", encoding="utf-8") as handle:
    config = json.load(handle)

config["version"] = 2
config["accessToken"] = bundle["accessToken"]
config["refreshToken"] = bundle["refreshToken"]
config["expiresAtISO"] = bundle.get("expiresAt") or bundle.get("expiresAtISO")

mcp_base_url = bundle.get("mcpBaseUrl")
if mcp_base_url:
    config["url"] = f'{mcp_base_url.rstrip("/")}/mcp'

for key in ("statusUrl", "refreshUrl", "plan", "accountLabel", "serverName"):
    if key in bundle and bundle[key] is not None:
        config[key] = bundle[key]

issued_at = bundle.get("issuedAtISO")
if issued_at:
    config["updatedAtISO"] = issued_at

with open(config_path, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")
PY
  fi

  if [[ -n "$EXPIRES_AT_ISO" ]]; then
    NOW_EPOCH="$(date -u +%s)"
    EXPIRES_AT_EPOCH="$(date -u -d "$EXPIRES_AT_ISO" +%s 2>/dev/null || true)"
    if [[ -n "$EXPIRES_AT_EPOCH" ]] && (( EXPIRES_AT_EPOCH <= NOW_EPOCH )) && [[ "$REFRESH_FAILED" == "true" || -z "$ACCESS_TOKEN" ]]; then
      echo "Bridge access token is expired and refresh failed. Re-run 'bardo login' or fix the website refresh origin before using direct remote Inspector." >&2
      echo "Refresh URL attempted: ${REFRESH_URL:-<missing>}" >&2
      exit 1
    fi
  fi
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  ACCESS_TOKEN="${BARDO_ACCESS_TOKEN:-${BARDO_API_KEY:-}}"
fi

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Missing a usable bridge credential. Point BARDO_CONFIG_DIR at a workspace that completed 'bardo login', or provide BARDO_ACCESS_TOKEN/BARDO_API_KEY only when you intentionally want a manual override." >&2
  echo "For clean-room testing, set BARDO_CONFIG_DIR to the workspace that completed 'bardo login'." >&2
  exit 1
fi

if [[ -z "$WORKSPACE_ROOT" && -n "$CONFIG_DIR" && "$CONFIG_DIR" == */.config/bardo ]]; then
  WORKSPACE_ROOT="${CONFIG_DIR%/.config/bardo}"
fi
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$PWD}"

echo "Inspecting the remote Bardo MCP at $MCP_URL" >&2
echo "Workspace root header: $WORKSPACE_ROOT" >&2
if [[ -n "$CONFIG_DIR" ]]; then
  echo "Bridge config dir: $CONFIG_DIR" >&2
fi
if [[ "$REFRESH_ATTEMPTED" == "true" ]]; then
  echo "Bridge credential refresh attempted before remote inspection." >&2
fi

exec npx -y @modelcontextprotocol/inspector \
  --cli "$MCP_URL" \
  --transport http \
  --method "$METHOD" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --header "x-bardo-workspace-root: $WORKSPACE_ROOT" \
  "${EXTRA_ARGS[@]}"
