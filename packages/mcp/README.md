# @bardo-ttrpg/mcp

Transparent local-first MCP server for Bardo.

`@bardo-ttrpg/mcp` exposes grounded tabletop campaign tools over stdio. It reads the current workspace and `.bardo/` artifacts through the local MCP connection. Local usage does not require a Bardo account or subscription.

## Development

```sh
pnpm build
pnpm test
pnpm mcp:inspect
```

Use `@bardo-ttrpg/cli` for the published `bardo` and `bardo-mcp` binaries.
