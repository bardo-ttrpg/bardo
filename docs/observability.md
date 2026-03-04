# Observability

This document is the operator-facing map of where to look when Bardo is
misbehaving.

## Services

### Website

- platform: Vercel
- Sentry project: `bardo-website`
- responsibilities:
  - dashboard
  - API keys
  - billing
  - connect flow
  - runtime status

### MCP

- platform: Railway
- Sentry project: `bardo-mcp`
- responsibilities:
  - MCP transport
  - auth boundary
  - session lifecycle
  - tool execution
  - metrics at `/metrics`

## Core Health Surfaces

### Website

Use route-level checks:

- `/`
- `/dashboard` auth behavior
- `/api/billing`
- `/api/keys`
- `/api/connect/runtime-status`

### MCP

- `GET /health`
- `GET /metrics` when enabled
- `POST /mcp`

## Sentry Environment Variables

### Website

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_AUTH_TOKEN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `NEXT_PUBLIC_SENTRY_RELEASE`

### MCP

- `BARDO_SENTRY_ENABLED`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `BARDO_SENTRY_TRACES_SAMPLE_RATE`

## Connect Flow Telemetry

The website tracks connect-flow counters in
[connect-telemetry.ts](/home/armando/projects/bardo/website/lib/connect-telemetry.ts).

Current counters:

- `cli_token_issued`
- `cli_token_failed`
- `cli_exchange_success`
- `cli_exchange_rejected`
- `cli_exchange_failed`
- `cli_session_started`
- `cli_session_start_failed`
- `cli_session_poll_pending`
- `cli_session_poll_approved`
- `cli_session_poll_rejected`
- `cli_session_poll_failed`
- `cli_session_approved`
- `cli_session_approve_rejected`
- `cli_session_approve_failed`
- `runtime_status_success`
- `runtime_status_invalid`
- `runtime_status_failed`

If `BARDO_CONNECT_TELEMETRY_LOG=true`, the website logs periodic snapshots.

## MCP Metrics

Prometheus output is available through `/metrics` when telemetry and the route
are enabled.

Examples already covered in tests include:

- `bardo_http_requests_total`
- `bardo_http_request_duration_ms`
- setup/eval/legacy-compat metrics under `mcp/src/telemetry`

Auth can be required for `/metrics` depending on
`BARDO_METRICS_REQUIRE_AUTH`.

## Minimum Good Signals Before Promotion

Website:

- dashboard loads
- key creation succeeds
- snippet generation succeeds
- CLI session start/poll/approve succeeds
- runtime status succeeds

MCP:

- `/health` returns `200`
- `validate:env` passes
- unauthenticated `/mcp` requests are rejected
- one authenticated MCP flow works

## First Checks During Incident Response

1. Identify the failing surface.
2. Check Sentry release/environment tags.
3. Check backing services:
   - Clerk
   - Upstash
   - Vercel
   - Railway
4. For MCP, compare `/health` and `/metrics`.
5. For connect flow, compare start, poll, approve, exchange, and runtime status
   counters.
