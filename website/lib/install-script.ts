import {
	BARDO_MCP_PUBLIC_RELEASES_BASE_URL,
	BARDO_MCP_RELEASE_VERSION,
} from "./bardo-mcp-release";

const REPO_URL = "https://github.com/armando-andre/bardo.git";

type ReleaseArtifact = {
	platform: "linux" | "darwin" | "windows";
	arch: "x64" | "arm64";
	filename: string;
};

function resolveReleaseArtifacts(version: string): ReleaseArtifact[] {
	return [
		{ platform: "linux", arch: "x64", filename: `bardo-${version}-linux-x64` },
		{
			platform: "linux",
			arch: "arm64",
			filename: `bardo-${version}-linux-arm64`,
		},
		{
			platform: "darwin",
			arch: "arm64",
			filename: `bardo-${version}-darwin-arm64`,
		},
		{
			platform: "darwin",
			arch: "x64",
			filename: `bardo-${version}-darwin-x64`,
		},
		{
			platform: "windows",
			arch: "x64",
			filename: `bardo-${version}-windows-x64.exe`,
		},
	];
}

const RELEASE_VERSION = BARDO_MCP_RELEASE_VERSION;
const RELEASE_ARTIFACTS = resolveReleaseArtifacts(RELEASE_VERSION);

function resolveInstallReleaseBaseUrl(): string {
	const override = process.env.BARDO_INSTALL_RELEASE_BASE_URL?.trim();
	if (override) {
		return override;
	}

	return `${BARDO_MCP_PUBLIC_RELEASES_BASE_URL}/${RELEASE_VERSION}`;
}

function renderSourceFallbackFunctions(): string {
	return `
install_from_source() {
\trequire_cmd git
\trequire_cmd bun
\trequire_cmd tar

\tSOURCE_REPO="\${BARDO_INSTALL_REPO:-${REPO_URL}}"
\tREPO_REF="\${BARDO_INSTALL_REF:-main}"
\tREPO_DIR="$INSTALL_ROOT/repo"
\tBUN_BIN="$(command -v bun)"

\tif [ -d "$SOURCE_REPO" ]; then
\t\trm -rf "$REPO_DIR"
\t\tmkdir -p "$REPO_DIR"
\t\ttar \\
\t\t\t--exclude='.git' \\
\t\t\t--exclude='node_modules' \\
\t\t\t--exclude='.next' \\
\t\t\t--exclude='.turbo' \\
\t\t\t--exclude='dist/release' \\
\t\t\t-C "$SOURCE_REPO" \\
\t\t\t-cf - . | tar -C "$REPO_DIR" -xf -
\telif [ -d "$REPO_DIR/.git" ]; then
\t\tif [ "$SOURCE_REPO" = "${REPO_URL}" ]; then
\t\t\tgit -C "$REPO_DIR" fetch --depth=1 origin "$REPO_REF"
\t\t\tgit -C "$REPO_DIR" checkout --force FETCH_HEAD
\t\telse
\t\t\trm -rf "$REPO_DIR"
\t\t\tgit clone --depth=1 "$SOURCE_REPO" "$REPO_DIR"
\t\tfi
\telse
\t\trm -rf "$REPO_DIR"
\t\tif [ "$SOURCE_REPO" = "${REPO_URL}" ]; then
\t\t\tgit clone --depth=1 --branch "$REPO_REF" "$SOURCE_REPO" "$REPO_DIR"
\t\telse
\t\t\tgit clone --depth=1 "$SOURCE_REPO" "$REPO_DIR"
\t\tfi
\tfi

\tcd "$REPO_DIR"
\tbun install --frozen-lockfile

\tcat > "$BIN_DIR/bardo" <<EOF
#!/usr/bin/env sh
exec "$BUN_BIN" "$REPO_DIR/packages/bardo-mcp/src/cli.ts" "\\$@"
EOF
\tchmod +x "$BIN_DIR/bardo"

\tcat > "$BIN_DIR/bardo-mcp" <<EOF
#!/usr/bin/env sh
exec "$BUN_BIN" "$REPO_DIR/packages/bardo-mcp/src/cli.ts" "\\$@"
EOF
\tchmod +x "$BIN_DIR/bardo-mcp"

\techo "Bardo installed from source to $REPO_DIR"
\techo "Source repository: $SOURCE_REPO"
}
`.trim();
}

export function renderUnixInstallScript(): string {
	const releaseBaseUrl = resolveInstallReleaseBaseUrl();
	const artifactCases = RELEASE_ARTIFACTS.filter(
		(artifact) => artifact.platform !== "windows",
	)
		.map((artifact) => {
			const key = `${artifact.platform}:${artifact.arch}`;
			return `\t\t${key})\n\t\t\tARTIFACT_FILENAME="${artifact.filename}"\n\t\t\t;;`;
		})
		.join("\n");

	return `#!/usr/bin/env sh
set -eu

require_cmd() {
\tif ! command -v "$1" >/dev/null 2>&1; then
\t\techo "error: required command '$1' is not installed." >&2
\t\texit 1
\tfi
\t}

download_file() {
\turl="$1"
\toutput="$2"
\tif command -v curl >/dev/null 2>&1; then
\t\tcurl -fsSL "$url" -o "$output"
\t\treturn
\tfi
\tif command -v wget >/dev/null 2>&1; then
\t\twget -qO "$output" "$url"
\t\treturn
\tfi
\techo "error: install requires curl or wget." >&2
\texit 1
}

verify_checksum() {
\tchecksum_file="$1"
\tartifact_path="$2"
\tartifact_name="$(basename "$artifact_path")"
\tif command -v sha256sum >/dev/null 2>&1; then
\t\t(cd "$(dirname "$artifact_path")" && grep "  $artifact_name$" "$checksum_file" | sha256sum -c -)
\t\treturn
\tfi
\tif command -v shasum >/dev/null 2>&1; then
\t\texpected="$(grep "  $artifact_name$" "$checksum_file" | awk '{print $1}')"
\t\tactual="$(shasum -a 256 "$artifact_path" | awk '{print $1}')"
\t\tif [ "$expected" != "$actual" ]; then
\t\t\techo "error: checksum verification failed for $artifact_name." >&2
\t\t\texit 1
\t\tfi
\t\treturn
\tfi
\techo "error: install requires sha256sum or shasum for checksum verification." >&2
\texit 1
}

${renderSourceFallbackFunctions()}

INSTALL_ROOT="\${BARDO_INSTALL_ROOT:-$HOME/.local/share/bardo}"
BIN_DIR="\${BARDO_BIN_DIR:-$HOME/.local/bin}"
INSTALL_MODE="\${BARDO_INSTALL_MODE:-binary}"
RELEASE_VERSION="${RELEASE_VERSION}"
RELEASE_BASE_URL="\${BARDO_INSTALL_RELEASE_BASE_URL:-${releaseBaseUrl}}"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"

if [ "$INSTALL_MODE" = "source" ] || [ -n "\${BARDO_INSTALL_REPO:-}" ]; then
\tinstall_from_source
\techo "Binaries written to $BIN_DIR"
\techo "If '$BIN_DIR' is not on your PATH, add it before running 'bardo login'."
\texit 0
fi

require_cmd uname
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch_raw="$(uname -m)"
case "$arch_raw" in
\tx86_64|amd64) arch="x64" ;;
\taarch64|arm64) arch="arm64" ;;
\t*) echo "error: unsupported architecture '$arch_raw'." >&2; exit 1 ;;
esac
case "$os:$arch" in
${artifactCases}
\t\t*) echo "error: unsupported platform '$os' and architecture '$arch'." >&2; exit 1 ;;
esac

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT INT TERM
artifact_path="$tmpdir/$ARTIFACT_FILENAME"
checksum_path="$tmpdir/SHA256SUMS.txt"

download_file "$RELEASE_BASE_URL/$ARTIFACT_FILENAME" "$artifact_path"
download_file "$RELEASE_BASE_URL/SHA256SUMS.txt" "$checksum_path"
verify_checksum "$checksum_path" "$artifact_path"

release_dir="$INSTALL_ROOT/releases/$RELEASE_VERSION"
installed_binary="$release_dir/$ARTIFACT_FILENAME"
mkdir -p "$release_dir"
cp "$artifact_path" "$installed_binary"
chmod +x "$installed_binary"

cat > "$BIN_DIR/bardo" <<EOF
#!/usr/bin/env sh
exec "$installed_binary" "\\$@"
EOF
chmod +x "$BIN_DIR/bardo"

cat > "$BIN_DIR/bardo-mcp" <<EOF
#!/usr/bin/env sh
exec "$installed_binary" "\\$@"
EOF
chmod +x "$BIN_DIR/bardo-mcp"

echo "Bardo release binary installed to $installed_binary"
echo "Verified against $RELEASE_BASE_URL/SHA256SUMS.txt"
echo "Binaries written to $BIN_DIR"
echo "If '$BIN_DIR' is not on your PATH, add it before running 'bardo login'."
`;
}

export function renderPowerShellInstallScript(): string {
	const releaseBaseUrl = resolveInstallReleaseBaseUrl();
	const windowsArtifact = RELEASE_ARTIFACTS.find(
		(artifact) => artifact.platform === "windows" && artifact.arch === "x64",
	);
	if (!windowsArtifact) {
		throw new Error("Missing windows release artifact.");
	}

	return `Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Normalize-PathEntry {
\tparam([string]$Value)
\tif (-not $Value) {
\t\treturn ''
\t}
\treturn ([System.IO.Path]::GetFullPath($Value)).TrimEnd('\\', '/')
}

function Test-PathListContains {
\tparam(
\t\t[string]$PathList,
\t\t[Parameter(Mandatory = $true)][string]$Entry
\t)
\t$normalizedEntry = Normalize-PathEntry $Entry
\tif (-not $normalizedEntry) {
\t\treturn $false
\t}
\t$separatorPattern = [regex]::Escape([System.IO.Path]::PathSeparator)
\tforeach ($candidate in (($PathList -split $separatorPattern) | Where-Object { $_ })) {
\t\tif ((Normalize-PathEntry $candidate) -ieq $normalizedEntry) {
\t\t\treturn $true
\t\t}
\t}
\treturn $false
}

function Add-BardoBinToPath {
\tparam([Parameter(Mandatory = $true)][string]$PathToAdd)
\t$normalizedBinDir = Normalize-PathEntry $PathToAdd
\t$separator = [System.IO.Path]::PathSeparator

\tif (-not (Test-PathListContains $env:Path $normalizedBinDir)) {
\t\t$env:Path = if ($env:Path) { "$normalizedBinDir$separator$env:Path" } else { $normalizedBinDir }
\t}

\t$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
\tif (-not (Test-PathListContains $userPath $normalizedBinDir)) {
\t\t$nextUserPath = if ($userPath) { "$userPath$separator$normalizedBinDir" } else { $normalizedBinDir }
\t\t[Environment]::SetEnvironmentVariable('Path', $nextUserPath, 'User')
\t\tWrite-Host "Added $normalizedBinDir to your user PATH and current PowerShell session."
\t} else {
\t\tWrite-Host "$normalizedBinDir is already on your user PATH."
\t}
}

function Require-Command {
\tparam([Parameter(Mandatory = $true)][string]$Name)
\tif (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
\t\tthrow "Required command '$Name' is not installed."
\t}
}

function Install-FromSource {
\tRequire-Command git
\tRequire-Command bun

\t$repoUrl = '${REPO_URL}'
\t$sourceRepo = if ($env:BARDO_INSTALL_REPO) { $env:BARDO_INSTALL_REPO } else { $repoUrl }
\t$repoRef = if ($env:BARDO_INSTALL_REF) { $env:BARDO_INSTALL_REF } else { 'main' }
\t$repoDir = Join-Path $installRoot 'repo'
\t$bunPath = (Get-Command bun).Source

\tif (Test-Path $sourceRepo -PathType Container) {
\t\tif (Test-Path $repoDir) {
\t\t\tRemove-Item -Recurse -Force $repoDir
\t\t}
\t\tNew-Item -ItemType Directory -Force -Path $repoDir | Out-Null
\t\tCopy-Item -Path (Join-Path $sourceRepo '*') -Destination $repoDir -Recurse -Force
\t\tif (Test-Path (Join-Path $repoDir 'node_modules')) {
\t\t\tRemove-Item -Recurse -Force (Join-Path $repoDir 'node_modules')
\t\t}
\t\tif (Test-Path (Join-Path $repoDir 'website/.next')) {
\t\t\tRemove-Item -Recurse -Force (Join-Path $repoDir 'website/.next')
\t\t}
\t\tif (Test-Path (Join-Path $repoDir '.turbo')) {
\t\t\tRemove-Item -Recurse -Force (Join-Path $repoDir '.turbo')
\t\t}
\t\tif (Test-Path (Join-Path $repoDir 'packages/bardo-mcp/dist/release')) {
\t\t\tRemove-Item -Recurse -Force (Join-Path $repoDir 'packages/bardo-mcp/dist/release')
\t\t}
\t} elseif (Test-Path (Join-Path $repoDir '.git')) {
\t\tif ($sourceRepo -eq $repoUrl) {
\t\t\tgit -C $repoDir fetch --depth=1 origin $repoRef
\t\t\tgit -C $repoDir checkout --force FETCH_HEAD
\t\t} else {
\t\t\tRemove-Item -Recurse -Force $repoDir
\t\t\tgit clone --depth=1 $sourceRepo $repoDir
\t\t}
\t} else {
\t\tif (Test-Path $repoDir) {
\t\t\tRemove-Item -Recurse -Force $repoDir
\t\t}
\t\tif ($sourceRepo -eq $repoUrl) {
\t\t\tgit clone --depth=1 --branch $repoRef $sourceRepo $repoDir
\t\t} else {
\t\t\tgit clone --depth=1 $sourceRepo $repoDir
\t\t}
\t}

\tPush-Location $repoDir
\ttry {
\t\tbun install --frozen-lockfile
\t} finally {
\t\tPop-Location
\t}

\t$wrapper = @"
@echo off
"$bunPath" "$repoDir\\packages\\bardo-mcp\\src\\cli.ts" %*
"@
\tSet-Content -LiteralPath (Join-Path $binDir 'bardo.cmd') -Value $wrapper -NoNewline
\tSet-Content -LiteralPath (Join-Path $binDir 'bardo-mcp.cmd') -Value $wrapper -NoNewline
\tAdd-BardoBinToPath $binDir
\tWrite-Host "Bardo installed from source to $repoDir"
\tWrite-Host "Source repository: $sourceRepo"
}

$installRoot = if ($env:BARDO_INSTALL_ROOT) { $env:BARDO_INSTALL_ROOT } else { Join-Path $HOME '.local/share/bardo' }
$binDir = if ($env:BARDO_BIN_DIR) { $env:BARDO_BIN_DIR } else { Join-Path $HOME '.local/bin' }
$installMode = if ($env:BARDO_INSTALL_MODE) { $env:BARDO_INSTALL_MODE } else { 'binary' }
$repoUrl = '${REPO_URL}'
$releaseVersion = '${RELEASE_VERSION}'
$releaseBaseUrl = if ($env:BARDO_INSTALL_RELEASE_BASE_URL) { $env:BARDO_INSTALL_RELEASE_BASE_URL } else { '${releaseBaseUrl}' }

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

if ($installMode -eq 'source' -or $env:BARDO_INSTALL_REPO) {
\tInstall-FromSource
\tWrite-Host "Command shims written to $binDir"
\tWrite-Host "You can run 'bardo login' in this PowerShell window. Restart other open terminals to pick up PATH changes."
\treturn
}

$artifactFile = '${windowsArtifact.filename}'
$releaseDir = Join-Path (Join-Path $installRoot 'releases') $releaseVersion
$installedBinary = Join-Path $releaseDir $artifactFile
$checksumPath = Join-Path ([System.IO.Path]::GetTempPath()) ('bardo-sha-' + [System.Guid]::NewGuid().ToString() + '.txt')
$artifactPath = Join-Path ([System.IO.Path]::GetTempPath()) ('bardo-bin-' + [System.Guid]::NewGuid().ToString() + '.exe')

try {
\tInvoke-WebRequest -Uri "$releaseBaseUrl/$artifactFile" -OutFile $artifactPath
\tInvoke-WebRequest -Uri "$releaseBaseUrl/SHA256SUMS.txt" -OutFile $checksumPath
\t$expectedLine = Select-String -Path $checksumPath -Pattern ([regex]::Escape($artifactFile))
\tif (-not $expectedLine) {
\t\tthrow "Checksum entry for $artifactFile was not found."
\t}
\t$expectedHash = (($expectedLine.Line -split '\\s+')[0]).Trim().ToLowerInvariant()
\t$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath).Hash.ToLowerInvariant()
\tif ($expectedHash -ne $actualHash) {
\t\tthrow "Checksum verification failed for $artifactFile."
\t}

\tNew-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
\tCopy-Item -LiteralPath $artifactPath -Destination $installedBinary -Force

\t$wrapper = @"
@echo off
"$installedBinary" %*
"@
\tSet-Content -LiteralPath (Join-Path $binDir 'bardo.cmd') -Value $wrapper -NoNewline
\tSet-Content -LiteralPath (Join-Path $binDir 'bardo-mcp.cmd') -Value $wrapper -NoNewline
\tAdd-BardoBinToPath $binDir

\tWrite-Host "Bardo release binary installed to $installedBinary"
\tWrite-Host "Verified against $releaseBaseUrl/SHA256SUMS.txt"
\tWrite-Host "Command shims written to $binDir"
\tWrite-Host "You can run 'bardo login' in this PowerShell window. Restart other open terminals to pick up PATH changes."
} finally {
\tif (Test-Path $artifactPath) { Remove-Item -Force $artifactPath }
\tif (Test-Path $checksumPath) { Remove-Item -Force $checksumPath }
}
`;
}
