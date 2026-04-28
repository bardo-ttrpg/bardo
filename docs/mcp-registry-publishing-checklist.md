# Bardo MCP Registry Publishing Checklist

Use this checklist for every public Bardo MCP release.

## Release identity

- Keep `packages/bardo-mcp/package.json`, `packages/bardo-mcp/server.json`, installer release assets, checksums, and docs on the same version.
- Keep `package.json#mcpName` equal to `server.json#name`: `io.github.armando-andre/bardo`.
- Keep the public npm package identifier as `@bardo/mcp` unless npm scope ownership forces a planned rename.

## Public listing repository

- Mirror only marketplace-safe files into `https://github.com/armando-andre/bardo-mcp`.
- Include `README.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`, `server.json`, `examples/cursor.mcp.json`, and `evals/bardo-mcp-readiness.xml`.
- Do not mirror private source, production environment variables, bridge secrets, billing bypasses, or internal runbooks.

## Publishing order

1. Run local checks in the private monorepo.
2. Publish `@bardo/mcp` to public npm.
3. Publish `server.json` with `mcp-publisher login github` and `mcp-publisher publish`.
4. Verify Official MCP Registry search for `io.github.armando-andre/bardo`.
5. Verify GitHub MCP Registry visibility at `https://github.com/mcp`.
6. Submit or claim listings on Cursor Marketplace, Smithery, MCP Market, mcp.so, and Glama.

## Marketplace positioning

- Bardo is free to download, paid to use.
- New users receive a 3-day trial.
- Bardo is local-first over stdio in this release.
- Hosted Bardo routes handle auth, browser approval, billing, entitlements, token refresh, and status only.
- Campaign truth, rulebook prep, current state, and committed canon stay local.

## Security checks

- No secrets in manifests, README examples, registry metadata, screenshots, or public repo history.
- No remote MCP listing until Streamable HTTP OAuth is implemented and tested.
- Unauthenticated approval requests must continue to return `401 Unauthorized`.
- Entitlement failures must fail closed.
