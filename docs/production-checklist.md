# Production Checklist

This is the shortest path from the current repo state to a working production setup.

## What is already true

1. Railway project exists: `bardo-mcp`
1. Railway project id: `ec9ed69c-b1e0-44a0-a5fe-08877b0c4d67`
1. Local `mcp` workspace is linked to Railway production.
1. Railway project currently has no service yet.
1. Sentry projects exist:
   `bardo-website`
   `bardo-mcp`
1. Both Sentry projects currently have no releases yet.

## Step 1: finish the website env

Set these in the website deployment:

1. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
1. `CLERK_SECRET_KEY`
1. `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
1. `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
1. `CLERK_BILLING_PLAN_SOLO`
1. `CLERK_BILLING_PLAN_SOLO_PLUS`
1. `NEXT_PUBLIC_APP_URL=https://<your-website-domain>`
1. `BARDO_MCP_BASE_URL=https://<your-railway-mcp-domain>`
1. `BARDO_AUTH_INTROSPECTION_TOKEN=<shared-secret>`
1. `SENTRY_DSN=<bardo-website-dsn>`
1. `NEXT_PUBLIC_SENTRY_DSN=<bardo-website-dsn>`
1. `SENTRY_ENVIRONMENT=production`
1. `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
1. `SENTRY_RELEASE=<git-sha-or-release-name>`
1. `SENTRY_ORG=bardo`
1. `SENTRY_PROJECT=bardo-website`
1. `SENTRY_AUTH_TOKEN=<sentry-auth-token>`

`NEXT_PUBLIC_SENTRY_ENVIRONMENT` is required whenever `NEXT_PUBLIC_SENTRY_DSN` is enabled. The browser SDK is now intentionally disabled in non-development builds until that public environment value is set, so staging cannot silently report as production.

Simple check:

1. Open the website.
1. Sign in.
1. Open the dashboard.
1. Create one API key.

## Step 2: finish the Railway MCP service

In Railway, create the first service from the `mcp` folder.

Set these service settings:

1. Root directory: `mcp`
1. Config file: `/mcp/railway.json` if Railway is pointed at repo root
1. Health check path: `/health`
1. Replicas: `1`

Set these env vars:

1. `NODE_ENV=production`
1. `BARDO_AUTH_PROVIDER=hosted`
1. `BARDO_AUTH_MODE=required`
1. `BARDO_AUTH_INTROSPECTION_URL=https://<your-website-domain>/api/auth/introspect-key`
1. `BARDO_AUTH_INTROSPECTION_TOKEN=<same-shared-secret-as-website>`
1. `BARDO_STRICT_CANONICAL_MODE=true`
1. `BARDO_DEFAULT_RULESET=d20_v1`
1. `BARDO_MCP_TRANSPORT_MODE=stateful`
1. `BARDO_SESSION_TTL_MS=3600000`
1. `BARDO_AUTH_CACHE_TTL_MS=120000`
1. `BARDO_AUTH_INVALID_CACHE_TTL_MS=30000`
1. `BARDO_AUTH_INTROSPECTION_TIMEOUT_MS=10000`
1. `BARDO_SENTRY_ENABLED=true`
1. `BARDO_SENTRY_TRACES_SAMPLE_RATE=0.1`
1. `SENTRY_DSN=<bardo-mcp-dsn>`
1. `SENTRY_ENVIRONMENT=production`
1. `SENTRY_RELEASE=<git-sha-or-release-name>`
1. `BARDO_TELEMETRY_ENABLED=true`
1. `BARDO_METRICS_ROUTE_ENABLED=true`
1. `BARDO_METRICS_REQUIRE_AUTH=true`

Recommended if you want shared rate limits:

1. `UPSTASH_REDIS_REST_URL`
1. `UPSTASH_REDIS_REST_TOKEN`

Simple check:

1. Open `https://<your-railway-mcp-domain>/health`
1. Confirm it returns `200`

## Step 3: mount persistent storage

The MCP service writes data under `./customers`.

In Railway, mount a volume at:

1. `/app/customers`

Simple check:

1. Restart the service.
1. Confirm customer data is still there after restart.

## Step 4: verify website to MCP auth

Both apps must use the same `BARDO_AUTH_INTROSPECTION_TOKEN`.

Simple check:

1. Create an API key in the website.
1. Use that key against the MCP endpoint.
1. Confirm the MCP request succeeds.

If it fails, check:

1. Website `BARDO_AUTH_INTROSPECTION_TOKEN`
1. MCP `BARDO_AUTH_INTROSPECTION_TOKEN`
1. MCP `BARDO_AUTH_INTROSPECTION_URL`

## Step 5: verify Sentry

Both projects exist, but releases are still missing.

To fix that:

1. Set `SENTRY_RELEASE` in both deployments.
1. Set `SENTRY_AUTH_TOKEN` for the website build.
1. Deploy the website.
1. Deploy the MCP service.

Simple check:

1. Open Sentry project `bardo-website`
1. Open Sentry project `bardo-mcp`
1. Confirm each project now shows a release
1. Confirm logs and errors arrive in the correct project

## Step 6: use Bun only for the local adapter

The local adapter command is now Bun-only:

```bash
bunx --bun --package @bardo/mcp bardo-mcp --api-key <key> --url <mcp-url>
```

Use remote mode first if you want the fastest production path.

Use local mode after you publish the adapter package:

```bash
cd packages/bardo-mcp
bun publish
```

## Current blockers to clear next

1. Link the local `mcp` workspace to the Railway project before using Railway service inspection tools.
1. Set real production domains in website and MCP env vars.
1. Add real Sentry release values so releases stop showing as empty.
