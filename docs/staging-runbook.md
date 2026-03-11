# Bardo Staging Runbook

## Purpose
Promote the current repo from local development confidence to a real staging candidate without changing the platform split:

1. `website` on Vercel
1. `mcp` on Railway

Staging is the environment where hosted auth, connect flows, CLI flows, and strict canonical gameplay are validated together.

## Pre-staging Gate
Run these from the repo root before any staging deploy:

```bash
bun run staging:readiness
```

This executes:

1. `bun run check`
1. `bun run build`
1. `bun run test`
1. `bun run test:e2e`
1. `bun run test:release-gates`
1. `bun run --cwd mcp ga:readiness`

If the working tree is intentionally dirty while other feature work is in flight, rehearse the full dev-exit gate in an isolated temp repo instead of stashing or reverting local changes:

```bash
BARDO_KEEP_DEV_EXIT_CLEAN_ROOM=true bun run dev:exit:clean-room
```

Notes:

1. this copies the current repo into a temporary clean-room workspace
1. it initializes a throwaway git repo there so `bun run dev:exit` can enforce a clean worktree without touching your real checkout
1. it preserves the temp path on failure, and also preserves it on success when `BARDO_KEEP_DEV_EXIT_CLEAN_ROOM=true`

## Staging Environment Validation
Validate the staging env contract locally against exported staging values before deploying:

```bash
bun run staging:validate-env
```

This checks:

1. website staging env via `website/scripts/validate-staging-env.ts`
1. MCP staging env via `mcp/scripts/validate-staging-env.ts`

Important staging defaults:

1. `website` uses staging Clerk keys
1. `mcp` uses hosted auth
1. `BARDO_STRICT_CANONICAL_MODE=true`
1. `BARDO_GUIDED_SETUP_ENABLED=false`
1. `BARDO_MCP_TRANSPORT_MODE=stateful`
1. Railway keeps `numReplicas=1`
1. Railway volume remains mounted at `/app/customers`

## Deploy Order
1. Deploy `website` to Vercel staging
1. Confirm `POST /api/auth/introspect-key` is reachable
1. Deploy `mcp` to Railway staging
1. Confirm Railway staging env points at the staged website introspection route
1. Confirm both services use the same `BARDO_AUTH_INTROSPECTION_TOKEN`
1. Confirm `SENTRY_RELEASE` uses the same release-candidate SHA on both services

## Automated Smoke Checks
After deploy, run:

```bash
STAGING_WEBSITE_URL=https://staging.example.com \
STAGING_MCP_URL=https://mcp-staging.example.com/mcp \
STAGING_API_KEY=replace_with_real_staging_key \
STAGING_INTROSPECTION_TOKEN=replace_with_shared_secret \
STAGING_VERCEL_PROTECTION_BYPASS_SECRET=replace_with_vercel_bypass_secret \
STAGING_AUTH_COOKIE='__session=replace_with_staging_session_cookie' \
bun run staging:smoke
```

The smoke script validates:

1. website root responds
1. MCP `/health` returns `200`
1. website introspection accepts a real staging key
1. MCP rejects missing and invalid keys
1. MCP `initialize`, `tools/list`, and `prompts/list`
1. MCP `resource://reports/world-state-overview`
1. MCP `world_state_overview` tool returns markdown grounded in workspace evidence
1. MCP `resource://reports/last-session-diff`
1. MCP `last_session_diff` tool returns the recent-change continuity view
1. `scene_turn` gameplay flow
1. website `/api/connect/runtime-status`
1. website `/api/connect/snippets` points to staging MCP
1. website `/api/connect/cli-session/start` and initial `/poll`
1. with `STAGING_AUTH_COOKIE`, dashboard `/api/keys` list/create/delete
1. with `STAGING_AUTH_COOKIE`, `/api/connect/cli-session/approve`
1. with `STAGING_AUTH_COOKIE`, `/api/connect/cli-token` and `/api/connect/cli-exchange`
1. runtime status succeeds with both approved and exchanged keys

Notes:

1. `STAGING_AUTH_COOKIE` should be a real staging browser session cookie for the seeded smoke user.
1. If `STAGING_AUTH_COOKIE` is omitted, the script still covers unauthenticated smoke checks and explicitly skips protected dashboard/CLI checks.
1. If `website` staging uses a protected Vercel Preview deployment, set `STAGING_VERCEL_PROTECTION_BYPASS_SECRET` so the smoke runner can send Vercel's automation bypass headers and set the bypass cookie automatically.

## Manual Staging Checks
These still require human signoff:

1. sign in through the staging website with a real Clerk staging account
1. confirm dashboard loads after auth
1. confirm the dashboard credits display shows remaining credits and next reset
1. create, rotate, and revoke a key from the dashboard
1. generate a CLI login command from the dashboard
1. complete one real CLI login / connect flow
1. run `bardo init` from a clean local workspace and confirm `bardo/docs/` exists
1. read `bardo/docs/quickstart.md` and `logs/world-state-overview.md` from the local workspace
1. read `logs/timeline-diff.md` or `resource://reports/last-session-diff` after meaningful play
1. create or mutate campaign data in staging
1. restart the Railway MCP service
1. confirm the same campaign data still exists from `/app/customers`

## Staging Signoff
Staging is ready only when all are true:

1. `bun run staging:readiness` passed on the release candidate SHA
1. `bun run staging:validate-env` passed for staged values
1. `bun run staging:smoke` passed
1. manual dashboard + CLI checks passed
1. persistence survived one MCP restart
1. Sentry received staging events for both website and MCP

Archive for each staging deploy:

1. release SHA
1. Vercel deploy ID
1. Railway deploy ID
1. gate output logs
1. smoke output logs
1. one successful CLI/connect artifact
1. one successful gameplay artifact

## Rollback Triggers
Rollback the staging candidate immediately if:

1. MCP cannot introspect keys through website staging
1. Railway volume is missing or non-persistent
1. strict-mode gameplay fails
1. staging points at production URLs, secrets, or data stores

## Rollback Steps
1. stop using the broken staging deploy
1. restore the previous known-good Vercel deployment
1. roll Railway back to the previous known-good deployment
1. re-run `bun run staging:smoke`
1. re-run the manual dashboard + CLI + persistence checks
