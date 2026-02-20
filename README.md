# bardo monorepo

This repository is organized as a Turborepo workspace with two packages:

- `website`: Next.js website package (Turbopack dev server on port `3001`)
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

Run Convex dev worker (from `website`):

```bash
cd website
bunx convex dev
```

If Convex warns about `/tmp` being on a different filesystem, set:

```bash
CONVEX_TMPDIR=./convex/.tmp
```

Run website only:

```bash
bun run dev:website
```

## Website auth setup (Clerk)

Copy `website/.env.example` values into your local env and set real Clerk keys:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
CLERK_JWT_ISSUER_DOMAIN=...
```

## Website billing setup (Stripe + Convex)

Set these in `website/.env.local`:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001

STRIPE_PRICE_SOLO_MONTHLY=price_...
STRIPE_PRICE_SOLO_YEARLY=price_...
STRIPE_PRICE_SOLO_PLUS_MONTHLY=price_...
STRIPE_PRICE_SOLO_PLUS_YEARLY=price_...
STRIPE_PRICE_PARTY_MONTHLY=price_...
STRIPE_PRICE_PARTY_YEARLY=price_...
```

Webhook endpoint:

- `POST /api/webhooks/stripe`

## MCP security policy

The MCP server supports policy-driven auth and traffic guards:

```bash
BARDO_AUTH_MODE=optional|required
BARDO_ALLOW_QUERY_API_KEY=true|false
BARDO_MAX_REQUEST_BYTES=1048576
BARDO_SESSION_TTL_MS=3600000
BARDO_RATE_LIMIT_WINDOW_MS=60000
BARDO_RATE_LIMIT_MAX_REQUESTS=120
BARDO_RATE_LIMIT_FAIL_CLOSED=false
```

Recommended production defaults:

```bash
BARDO_AUTH_MODE=required
BARDO_ALLOW_QUERY_API_KEY=false
BARDO_RATE_LIMIT_FAIL_CLOSED=true
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Orchestrated Turn API (Custom)

Bardo now exposes a non-default REST orchestration layer on top of MCP:

- `POST /api/v1/turns/resolve`

This endpoint runs an opinionated workflow (`initialize` -> `player_action` ->
optional `world_sync` -> optional `state_get`) and returns a single JSON
response with `workflowId`.

Example:

```bash
curl -X POST http://localhost:3000/api/v1/turns/resolve \
  -H "content-type: application/json" \
  -H "x-api-key: user_key_1" \
  -d '{
    "action": "I travel to Ironhaven and ask for work.",
    "transcript": "I am Captain Halvar. Welcome to Ironhaven.",
    "includeState": true
  }'
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
- Trigger review by commenting `@greptile` on the PR.

## Codex PR review trigger

- Trigger Codex review by commenting `@codex` on the PR.
