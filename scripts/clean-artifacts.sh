#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

clean_dir() {
	local target="$1"
	if [ -d "$target" ]; then
		find "$target" -type f -delete
		find "$target" -type l -delete
		find "$target" -depth -type d -empty -delete
	fi
}

clean_dir "$ROOT_DIR/customers"
clean_dir "$ROOT_DIR/.turbo"
clean_dir "$ROOT_DIR/mcp/.turbo"
clean_dir "$ROOT_DIR/website/.turbo"
clean_dir "$ROOT_DIR/packages/bardo-mcp/.turbo"
clean_dir "$ROOT_DIR/website/.next"
clean_dir "$ROOT_DIR/website/.bun-tmp"
clean_dir "$ROOT_DIR/website/.bun-install"
clean_dir "$ROOT_DIR/website/test-results"
clean_dir "$ROOT_DIR/packages/bardo-mcp/node_modules"
clean_dir "$ROOT_DIR/packages/bardo-mcp/dist/release"

rm -f "$ROOT_DIR/website/tsconfig.tsbuildinfo"

echo "Artifact cleanup complete."
