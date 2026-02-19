#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
SOCKET_DIR="${AGENT_BROWSER_SOCKET_DIR:-$PWD/.agent-browser-sock}"
CHROME_BIN="${CHROMIUM_EXECUTABLE_PATH:-$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome}"
FONTCONFIG_PATH_VALUE="${FONTCONFIG_PATH:-/tmp/paclibs/etc/fonts}"
LD_LIBRARY_PATH_VALUE="${LD_LIBRARY_PATH:-/tmp/paclibs/usr/lib}"

if [ "$#" -gt 0 ]; then
  ROUTES=("$@")
else
  ROUTES=("/" "/pricing" "/mpc-docs" "/legal" "/sign-in" "/sign-up")
fi

mkdir -p "$SOCKET_DIR"

ab() {
  AGENT_BROWSER_SOCKET_DIR="$SOCKET_DIR" \
    FONTCONFIG_PATH="$FONTCONFIG_PATH_VALUE" \
    LD_LIBRARY_PATH="$LD_LIBRARY_PATH_VALUE" \
    AGENT_BROWSER_EXECUTABLE_PATH="$CHROME_BIN" \
    bunx agent-browser "$@"
}

printf '[\n'
first=1
for route in "${ROUTES[@]}"; do
  ab open "$BASE_URL$route" >/dev/null
  ab wait 1500 >/dev/null

  title="$(ab get title | tr -d '\000\r\n')"
  err_count="$(ab errors --json | jq '.data.errors | length')"

  perf_raw="$(
    ab eval 'JSON.stringify({
      resources: performance.getEntriesByType("resource").length,
      scripts: performance
        .getEntriesByType("resource")
        .filter((entry) => entry.initiatorType === "script").length,
      transferBytes: performance
        .getEntriesByType("resource")
        .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      domContentLoadedMs:
        performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
      loadEventMs:
        performance.timing.loadEventEnd - performance.timing.navigationStart,
      interactiveNodes: document.querySelectorAll(
        "a,button,input,select,textarea,[role=\"button\"],[role=\"link\"],[data-action]"
      ).length,
    })'
  )"

  perf_json="$(echo "$perf_raw" | tr -d '\000\r\n' | jq -r '.')"

  resources="$(echo "$perf_json" | jq '.resources')"
  scripts="$(echo "$perf_json" | jq '.scripts')"
  transfer="$(echo "$perf_json" | jq '.transferBytes')"
  dcl="$(echo "$perf_json" | jq '.domContentLoadedMs')"
  load="$(echo "$perf_json" | jq '.loadEventMs')"
  interactive="$(echo "$perf_json" | jq '.interactiveNodes')"

  if [ "$first" -eq 0 ]; then
    printf ',\n'
  fi
  first=0

  jq -nc \
    --arg route "$route" \
    --arg title "$title" \
    --argjson errors "$err_count" \
    --argjson resources "$resources" \
    --argjson scripts "$scripts" \
    --argjson transferBytes "$transfer" \
    --argjson domContentLoadedMs "$dcl" \
    --argjson loadEventMs "$load" \
    --argjson interactiveNodes "$interactive" \
    '{
      route: $route,
      title: $title,
      errors: $errors,
      resources: $resources,
      scripts: $scripts,
      transferBytes: $transferBytes,
      domContentLoadedMs: $domContentLoadedMs,
      loadEventMs: $loadEventMs,
      interactiveNodes: $interactiveNodes,
    }'
done
printf '\n]\n'
