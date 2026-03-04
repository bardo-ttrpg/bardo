# Availability and Degradation

This document describes current failure behavior across Bardo's deployed
surfaces.

It reflects the current codebase. If the current implementation fails closed,
that is documented here directly.

## Service Responsibilities

- `website` on Vercel
  - dashboard
  - API keys
  - billing
  - connect flow
  - runtime status
- `mcp` on Railway
  - MCP transport
  - auth boundary
  - tool execution
  - session lifecycle

## Clerk

Clerk is required for:

- website dashboard authentication
- API key creation and revoke
- billing snapshots
- runtime status validation

Current behavior:

- public website pages can still render without Clerk auth
- authenticated routes fail closed
- billing-dependent routes return `503` when live billing data is unavailable

Examples:

- `POST /api/keys` returns `503` when billing cannot be read
- `GET /api/billing` returns `503` when billing cannot be read

## Upstash

Upstash backs:

- CLI login replay protection
- CLI device-session storage
- connect-flow rate limiting
- distributed verification budgets

Current behavior:

- production auth-sensitive flows are expected to fail closed when Upstash is
  unavailable
- development and staging can use explicit memory fallback only when enabled by
  env
- routes now return structured backend-unavailable responses instead of generic
  failures

Examples:

- `POST /api/connect/cli-session/start` can return `503` with
  `code: "upstash_unavailable"`
- `GET /api/connect/cli-session/poll` can return `503` with
  `code: "upstash_unavailable"`
- `POST /api/connect/cli-session/approve` can return `503` with
  `code: "upstash_unavailable"`
- `POST /api/connect/cli-exchange` can return `503` with
  `code: "upstash_unavailable"`

## MCP Runtime Validation

The MCP server validates runtime policy combinations before serving traffic.

Current behavior:

- `mcp/index.ts` validates config during startup
- `bun run --cwd mcp validate:env` performs the same validation manually
- `bun run --cwd mcp check` now includes `validate:env`

If validation fails, the MCP should not start.

## Route Notes

### `/api/connect/snippets`

- `GET` is intentionally public
- `GET` never accepts secrets
- missing `client` or `mode` returns `400`
- real API keys must go through `POST`

### `/api/keys`

- authenticated route
- paginated with `limit` and `offset`
- usage lookups are concurrency-capped
- if a usage read fails, that key degrades to zeroed usage fields instead of
  failing the whole page

### `/api/keys/revoke`

- verifies key ownership through Clerk before deletion
- lookup timeout returns `504`
- deletion timeout returns `504`
- foreign keys return `404`

## Operator Guidance

When the connect flow fails:

1. Check Vercel route health first.
2. Check Upstash reachability next.
3. Check Clerk auth and billing availability.
4. Check `bardo-website` Sentry.

When MCP auth fails:

1. Check `GET /health`.
2. Run `bun run --cwd mcp validate:env`.
3. Verify `BARDO_AUTH_INTROSPECTION_URL` and
   `BARDO_AUTH_INTROSPECTION_TOKEN`.
4. Check `bardo-mcp` Sentry.
