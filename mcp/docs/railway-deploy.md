# Railway Deployment (MCP Only)

Production topology:

1. Website: Vercel (`website`)
1. MCP: Railway (`mcp`)

Only the MCP service is deployed on Railway.

## Railway service setup (MCP)

Create one Railway service from this monorepo:

1. Service name: `mcp`
1. Root directory: `mcp`

`mcp/railway.json` is pinned to `numReplicas=1` for stateful session correctness.

If you keep Railway service root at repo root instead, set:

1. `RAILWAY_CONFIG_FILE=/app/mcp/railway.json`

## Required env vars (Railway MCP service)

Required:

1. `NODE_ENV=production`
1. `PORT` (Railway injects this)
1. `BARDO_AUTH_PROVIDER=hosted`
1. `BARDO_AUTH_MODE=required`
1. `BARDO_AUTH_INTROSPECTION_URL=https://<website-domain>/api/auth/introspect-key`
1. `BARDO_AUTH_INTROSPECTION_TOKEN` (must exactly match website secret)
1. `BARDO_STRICT_CANONICAL_MODE=true`
1. `BARDO_DEFAULT_RULESET=d20_v1`

Recommended:

1. `BARDO_MCP_TRANSPORT_MODE=stateful`
1. `BARDO_SESSION_TTL_MS=3600000`
1. `BARDO_AUTH_CACHE_TTL_MS=120000`
1. `BARDO_TELEMETRY_ENABLED=true`
1. `BARDO_METRICS_ROUTE_ENABLED=true`
1. `BARDO_METRICS_REQUIRE_AUTH=true`
1. `UPSTASH_REDIS_REST_URL`
1. `UPSTASH_REDIS_REST_TOKEN`

## Website requirements (Vercel)

The website must expose:

1. `POST /api/auth/introspect-key`

The website and MCP must share the same:

1. `BARDO_AUTH_INTROSPECTION_TOKEN`

## Persistent storage

MCP writes canonical campaign data under `./customers/<userId>`.

To avoid data loss between deploys/restarts, mount a Railway Volume at:

1. `/app/customers`

This path works with current key claims (`./customers/<userId>`) and keeps per-user campaign state durable.

## Cost + UX tuning

1. Keep MCP in `stateful` mode for lower auth/introspection overhead.
1. Keep MCP on a single replica while using `stateful` mode.
1. If you need horizontal MCP scaling, switch to `BARDO_MCP_TRANSPORT_MODE=stateless`.
1. Keep Upstash enabled for verification budgets and distributed limits.
1. Keep website on Vercel and MCP on Railway to isolate deploy cadence and resource usage.

## Smoke checks

1. `GET https://<mcp-domain>/health` returns `200`.
1. Website `POST /api/auth/introspect-key` returns `{ "valid": true }` for a valid key.
1. MCP initialize request returns `mcp-session-id`.
1. MCP `tools/list` works with:
   `accept: application/json, text/event-stream`
   `mcp-protocol-version: 2025-06-18`
