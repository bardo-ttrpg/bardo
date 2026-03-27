export type InstallOs = "macos" | "linux" | "windows";

export const INSTALL_REPOSITORY = "armando-andre/bardo";
export const INSTALL_REF = "v0.1.0";
export const SHELL_INSTALL_COMMAND = "curl -fsSL https://bardo.gg/install | sh";
export const POWERSHELL_INSTALL_COMMAND =
	"irm https://bardo.gg/install.ps1 | iex";

export const INSTALL_COMMANDS: Record<
	InstallOs,
	{ label: string; command: string }
> = {
	macos: {
		label: "macOS",
		command: SHELL_INSTALL_COMMAND,
	},
	linux: {
		label: "Linux",
		command: SHELL_INSTALL_COMMAND,
	},
	windows: {
		label: "Windows",
		command: POWERSHELL_INSTALL_COMMAND,
	},
};

export function getShellInstallScript() {
	return `#!/usr/bin/env sh
set -eu

REF="${INSTALL_REF}"
ARCHIVE_URL="https://github.com/${INSTALL_REPOSITORY}/archive/refs/tags/${INSTALL_REF}.tar.gz"
INSTALL_ROOT="\${BARDO_INSTALL_ROOT:-$HOME/.local/share/bardo}"
BIN_DIR="\${BARDO_BIN_DIR:-$HOME/.local/bin}"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bardo currently installs through the curl script by downloading the tagged source and requires Bun on PATH."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
  echo "Bardo install requires curl and tar."
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

curl -fsSL "$ARCHIVE_URL" -o "$TMP_DIR/bardo.tar.gz"
tar -xzf "$TMP_DIR/bardo.tar.gz" -C "$TMP_DIR"

SOURCE_ROOT="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
PACKAGE_DIR="$SOURCE_ROOT/packages/bardo-mcp"
TARGET_DIR="$INSTALL_ROOT/$REF"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$PACKAGE_DIR"/. "$TARGET_DIR"/

(cd "$TARGET_DIR" && bun install --production)

chmod +x "$TARGET_DIR/bin/bardo.js" "$TARGET_DIR/bin/bardo-mcp.js"
ln -sf "$TARGET_DIR/bin/bardo.js" "$BIN_DIR/bardo"
ln -sf "$TARGET_DIR/bin/bardo-mcp.js" "$BIN_DIR/bardo-mcp"

printf '\\nInstalled Bardo from %s at %s\\n' "$REF" "$TARGET_DIR"
printf 'Make sure %s is on your PATH.\\n' "$BIN_DIR"
`;
}

export function getPowerShellInstallScript() {
	return `$ErrorActionPreference = "Stop"

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bardo currently installs through the website script by downloading the tagged source and requires Bun on PATH."
}

${"$"}repo = "${INSTALL_REPOSITORY}"
${"$"}ref = "${INSTALL_REF}"
${"$"}archiveUrl = "https://github.com/${INSTALL_REPOSITORY}/archive/refs/tags/${INSTALL_REF}.zip"
${"$"}installRoot = if ($env:BARDO_INSTALL_ROOT) { $env:BARDO_INSTALL_ROOT } else { Join-Path $HOME "AppData\\Local\\bardo" }
${"$"}binDir = if ($env:BARDO_BIN_DIR) { $env:BARDO_BIN_DIR } else { Join-Path $installRoot "bin" }
${"$"}tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("bardo-" + [System.Guid]::NewGuid().ToString("N"))
${"$"}archivePath = Join-Path $tempRoot "bardo.zip"

New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath
Expand-Archive -Path $archivePath -DestinationPath $tempRoot -Force

${"$"}sourceRoot = Get-ChildItem -Path $tempRoot -Directory | Select-Object -First 1
${"$"}packageDir = Join-Path $sourceRoot.FullName "packages\\bardo-mcp"
${"$"}targetDir = Join-Path $installRoot $ref

New-Item -ItemType Directory -Force -Path $installRoot, $binDir | Out-Null
if (Test-Path $targetDir) {
  Remove-Item -Recurse -Force $targetDir
}
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -Path (Join-Path $packageDir "*") -Destination $targetDir -Recurse -Force

Push-Location $targetDir
bun install --production
Pop-Location

${"$"}bardoCmd = @(
  "@echo off",
  ('bun "' + (Join-Path $targetDir "bin\\bardo.js") + '" %*')
)
${"$"}bardoMcpCmd = @(
  "@echo off",
  ('bun "' + (Join-Path $targetDir "bin\\bardo-mcp.js") + '" %*')
)
Set-Content -Path (Join-Path $binDir "bardo.cmd") -Value $bardoCmd
Set-Content -Path (Join-Path $binDir "bardo-mcp.cmd") -Value $bardoMcpCmd

Write-Host ""
Write-Host ("Installed Bardo from " + $ref + " at " + $targetDir)
Write-Host ("Make sure " + $binDir + " is on your PATH.")
`;
}
