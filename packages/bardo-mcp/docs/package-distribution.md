# Package Distribution

Bardo MCP should be published as `@bardo/mcp` on the public npm registry.

## Recommended Registry

Use npm as the primary package registry because the Official MCP Registry package metadata points at npm package identifiers.

Publishing a second GitHub Packages npm package is not recommended for public MCP discovery because GitHub Packages usually requires explicit registry configuration and authentication. That adds friction for users and marketplaces.

## Source Repository

The public `bardo-mcp` repository is the public listing and documentation repository. The release package is built from Bardo's private release workspace so it can include signed release binaries and the exact files listed by `npm publish --dry-run`.

## Publish Checklist

Before publishing:

1. Run the release build that creates all platform binaries.
2. Run `npm publish --dry-run --access public`.
3. Confirm the tarball includes `README.md`, `SECURITY.md`, `server.json`, docs, examples, skill files, and release binaries.
4. Publish with `npm publish --access public` from the release package directory.
5. Publish or update the Official MCP Registry metadata after npm is live.

## GitHub Releases

GitHub Releases are appropriate for downloadable binary assets, checksums, and changelog notes. They are not a replacement for the public npm package used by MCP registry metadata.
