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
```

## Quality checks

```bash
bun run lint
bun run typecheck
bun run check
bun run biome:check
```
