# bardo monorepo

This repository is organized as a Turborepo workspace with two packages:

- `website/docs`: Next.js website package (Turbopack dev server on port `3001`)
- `mcp`: Bun-based Bardo MCP server (port `3000`)

## Install

```bash
bun install
```

## Development

Run both packages:

```bash
bun run dev
```

Run MCP only:

```bash
bun run dev:mcp
```

Run website only:

```bash
bun run dev:website
```

## Website auth setup (Clerk)

Copy `website/docs/.env.example` values into your local env and set real Clerk keys:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_JWT_ISSUER_DOMAIN=...
```

## MCP security policy

The MCP server supports policy-driven auth and traffic guards:

```bash
BARDO_AUTH_MODE=optional|required
BARDO_ALLOW_QUERY_API_KEY=true|false
BARDO_MAX_REQUEST_BYTES=1048576
BARDO_SESSION_TTL_MS=3600000
BARDO_RATE_LIMIT_WINDOW_MS=60000
BARDO_RATE_LIMIT_MAX_REQUESTS=120
```

Recommended production defaults:

```bash
BARDO_AUTH_MODE=required
BARDO_ALLOW_QUERY_API_KEY=false
```

## Quality checks

```bash
bun run lint
bun run typecheck
bun run check
bun run biome:check
```

## Greptile integration

- Repository-level Greptile policy is defined in `greptile.json`.
- Install/enable the Greptile GitHub app for this repository in your Greptile workspace.
- PRs should resolve high-signal security/performance findings before merge.
