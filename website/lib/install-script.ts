const REPO_URL = "https://github.com/armando-andre/bardo.git";
const REPO_REF = "main";

export function renderUnixInstallScript(): string {
	return `#!/usr/bin/env sh
set -eu

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "error: required command '$1' is not installed." >&2
		exit 1
	fi
}

require_cmd git
require_cmd bun
require_cmd tar

INSTALL_ROOT="\${BARDO_INSTALL_ROOT:-$HOME/.local/share/bardo}"
BIN_DIR="\${BARDO_BIN_DIR:-$HOME/.local/bin}"
REPO_DIR="$INSTALL_ROOT/repo"
SOURCE_REPO="\${BARDO_INSTALL_REPO:-${REPO_URL}}"
REPO_REF="\${BARDO_INSTALL_REF:-${REPO_REF}}"
BUN_BIN="$(command -v bun)"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

if [ -d "$SOURCE_REPO" ]; then
	rm -rf "$REPO_DIR"
	mkdir -p "$REPO_DIR"
	tar \
		--exclude='.git' \
		--exclude='node_modules' \
		--exclude='.next' \
		--exclude='.turbo' \
		--exclude='dist/release' \
		-C "$SOURCE_REPO" \
		-cf - . | tar -C "$REPO_DIR" -xf -
elif [ -d "$REPO_DIR/.git" ]; then
	if [ "$SOURCE_REPO" = "${REPO_URL}" ]; then
		git -C "$REPO_DIR" fetch --depth=1 origin "$REPO_REF"
		git -C "$REPO_DIR" checkout --force FETCH_HEAD
	else
		rm -rf "$REPO_DIR"
		git clone --depth=1 "$SOURCE_REPO" "$REPO_DIR"
	fi
else
	rm -rf "$REPO_DIR"
	if [ "$SOURCE_REPO" = "${REPO_URL}" ]; then
		git clone --depth=1 --branch "$REPO_REF" "$SOURCE_REPO" "$REPO_DIR"
	else
		git clone --depth=1 "$SOURCE_REPO" "$REPO_DIR"
	fi
fi

cd "$REPO_DIR"
bun install --frozen-lockfile

cat > "$BIN_DIR/bardo" <<EOF
#!/usr/bin/env sh
exec "$BUN_BIN" "$REPO_DIR/packages/bardo-mcp/src/cli.ts" "\\$@"
EOF
chmod +x "$BIN_DIR/bardo"

cat > "$BIN_DIR/bardo-mcp" <<EOF
#!/usr/bin/env sh
exec "$BUN_BIN" "$REPO_DIR/packages/bardo-mcp/src/cli.ts" "\\$@"
EOF
chmod +x "$BIN_DIR/bardo-mcp"

echo "Bardo installed to $REPO_DIR"
echo "Binaries written to $BIN_DIR"
echo "Source repository: $SOURCE_REPO"
echo "If '$BIN_DIR' is not on your PATH, add it before running 'bardo login'."
`;
}

export function renderPowerShellInstallScript(): string {
	return `Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Require-Command {
	param([Parameter(Mandatory = $true)][string]$Name)
	if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
		throw "Required command '$Name' is not installed."
	}
}

Require-Command git
Require-Command bun

$installRoot = if ($env:BARDO_INSTALL_ROOT) { $env:BARDO_INSTALL_ROOT } else { Join-Path $HOME '.local/share/bardo' }
$binDir = if ($env:BARDO_BIN_DIR) { $env:BARDO_BIN_DIR } else { Join-Path $HOME '.local/bin' }
$repoDir = Join-Path $installRoot 'repo'
$bunPath = (Get-Command bun).Source
$repoUrl = '${REPO_URL}'
$sourceRepo = if ($env:BARDO_INSTALL_REPO) { $env:BARDO_INSTALL_REPO } else { $repoUrl }
$repoRef = if ($env:BARDO_INSTALL_REF) { $env:BARDO_INSTALL_REF } else { '${REPO_REF}' }

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

if (Test-Path $sourceRepo -PathType Container) {
	if (Test-Path $repoDir) {
		Remove-Item -Recurse -Force $repoDir
	}
	New-Item -ItemType Directory -Force -Path $repoDir | Out-Null
	Copy-Item -Path (Join-Path $sourceRepo '*') -Destination $repoDir -Recurse -Force
	if (Test-Path (Join-Path $repoDir 'node_modules')) {
		Remove-Item -Recurse -Force (Join-Path $repoDir 'node_modules')
	}
	if (Test-Path (Join-Path $repoDir 'website/.next')) {
		Remove-Item -Recurse -Force (Join-Path $repoDir 'website/.next')
	}
	if (Test-Path (Join-Path $repoDir '.turbo')) {
		Remove-Item -Recurse -Force (Join-Path $repoDir '.turbo')
	}
	if (Test-Path (Join-Path $repoDir 'packages/bardo-mcp/dist/release')) {
		Remove-Item -Recurse -Force (Join-Path $repoDir 'packages/bardo-mcp/dist/release')
	}
} elseif (Test-Path (Join-Path $repoDir '.git')) {
	if ($sourceRepo -eq $repoUrl) {
		git -C $repoDir fetch --depth=1 origin $repoRef
		git -C $repoDir checkout --force FETCH_HEAD
	} else {
		Remove-Item -Recurse -Force $repoDir
		git clone --depth=1 $sourceRepo $repoDir
	}
} else {
	if (Test-Path $repoDir) {
		Remove-Item -Recurse -Force $repoDir
	}
	if ($sourceRepo -eq $repoUrl) {
		git clone --depth=1 --branch $repoRef $sourceRepo $repoDir
	} else {
		git clone --depth=1 $sourceRepo $repoDir
	}
}

Push-Location $repoDir
try {
	bun install --frozen-lockfile
} finally {
	Pop-Location
}

$wrapper = @"
@echo off
"$bunPath" "$repoDir\\packages\\bardo-mcp\\src\\cli.ts" %*
"@

Set-Content -LiteralPath (Join-Path $binDir 'bardo.cmd') -Value $wrapper -NoNewline
Set-Content -LiteralPath (Join-Path $binDir 'bardo-mcp.cmd') -Value $wrapper -NoNewline

Write-Host "Bardo installed to $repoDir"
Write-Host "Command shims written to $binDir"
Write-Host "Source repository: $sourceRepo"
Write-Host "If '$binDir' is not on your PATH, add it before running 'bardo login'."
`;
}
