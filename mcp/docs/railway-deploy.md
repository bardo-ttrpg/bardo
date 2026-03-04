# Railway Deployment (MCP Only)

Production topology:

1. Website: Vercel (`website`)
1. MCP: Railway (`mcp`)

Only the MCP service is deployed on Railway.

Current Railway target:

1. Project name: `bardo-mcp`
1. Project ID: `ec9ed69c-b1e0-44a0-a5fe-08877b0c4d67`
1. Production environment: `production`
1. Current staging environment: `staging`
1. Current staging public domain: `https://mcp-staging-67d7.up.railway.app`

## Railway service setup (MCP)

Create one Railway service from this monorepo:

1. Service name: `mcp`
1. Root directory: `mcp`

`mcp/railway.json` is pinned to `numReplicas=1` for stateful session correctness.
The current repo config assumes Railway is building from the `mcp` directory itself, not from the monorepo root.

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
1. `BARDO_SENTRY_ENABLED=true`
1. `SENTRY_DSN` (project `bardo-mcp`)
1. `SENTRY_ENVIRONMENT=production`
1. `SENTRY_RELEASE=<git sha or deployment release>`

Recommended:

1. `BARDO_MCP_TRANSPORT_MODE=stateful`
1. `BARDO_SESSION_TTL_MS=3600000`
1. `BARDO_AUTH_CACHE_TTL_MS=120000`
1. `BARDO_AUTH_INVALID_CACHE_TTL_MS=30000`
1. `BARDO_AUTH_INTROSPECTION_TIMEOUT_MS=10000`
1. `BARDO_SENTRY_TRACES_SAMPLE_RATE=0.1`
1. `BARDO_TELEMETRY_ENABLED=true`
1. `BARDO_METRICS_ROUTE_ENABLED=true`
1. `BARDO_METRICS_REQUIRE_AUTH=true`
1. `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=true` until Upstash is configured
1. `UPSTASH_REDIS_REST_URL`
1. `UPSTASH_REDIS_REST_TOKEN`
1. use `bardo-staging` for staging and `bardo-production` for production if you create dedicated Upstash databases

## Website requirements (Vercel)

The website must expose:

1. `POST /api/auth/introspect-key`

The website and MCP must share the same:

1. `BARDO_AUTH_INTROSPECTION_TOKEN`

If staging uses a protected Vercel Preview deployment, the MCP introspection URL must use Vercel's automation bypass support. The simplest current setup is:

1. `BARDO_AUTH_INTROSPECTION_URL=https://<preview-url>/api/auth/introspect-key?x-vercel-protection-bypass=<secret>`

Recommended website-side Sentry config:

1. `SENTRY_ORG=bardo-1k`
1. `SENTRY_PROJECT=bardo-website`
1. `SENTRY_DSN`
1. `NEXT_PUBLIC_SENTRY_DSN`
1. `SENTRY_ENVIRONMENT=production`
1. `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
1. `SENTRY_RELEASE=<git sha or deployment release>`
1. `SENTRY_AUTH_TOKEN` for source-map upload

## Persistent storage

MCP writes canonical campaign data under `./customers/<userId>`.

To avoid data loss between deploys/restarts, mount a Railway Volume at:

1. `/app/customers`

This path works with current key claims (`./customers/<userId>`) and keeps per-user campaign state durable.

Current verified staging state:

1. the Railway volume is mounted at `/app/customers`
1. `GET https://mcp-staging-67d7.up.railway.app/health` returns `200`
1. `POST /mcp` without an API key returns `401`
1. `POST /mcp` with an invalid API key returns `403 Invalid API key`
1. the MCP can reach the protected Vercel Preview introspection route when
   `BARDO_AUTH_INTROSPECTION_URL` includes the Vercel automation bypass secret

## Cost + UX tuning

1. Keep MCP in `stateful` mode for lower auth/introspection overhead.
1. Keep MCP on a single replica while using `stateful` mode.
1. If you need horizontal MCP scaling, switch to `BARDO_MCP_TRANSPORT_MODE=stateless`.
1. If Upstash is not enabled yet, keep `BARDO_MCP_USAGE_LIMIT_ALLOW_MEMORY_FALLBACK=true`.
1. Enable Upstash when you need shared/distributed usage limits across instances.
1. Keep website on Vercel and MCP on Railway to isolate deploy cadence and resource usage.

## Smoke checks

1. `GET https://<mcp-domain>/health` returns `200`.
1. Website `POST /api/auth/introspect-key` returns `{ "valid": true }` for a valid key.
1. MCP initialize request returns `mcp-session-id`.
1. Sentry receives MCP startup logs under project `bardo-mcp`.
1. Sentry receives website introspection logs under project `bardo-website`.
1. MCP `tools/list` works with:
   `accept: application/json, text/event-stream`
   `mcp-protocol-version: 2025-06-18`

Important Sentry note:

1. `SENTRY_RELEASE` should still be set on MCP even if Sentry does not show a
   release immediately
1. current live staging and production both have visible `bardo-mcp` Sentry releases
