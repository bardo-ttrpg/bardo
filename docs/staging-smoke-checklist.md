# Staging Smoke Checklist

Run this after every meaningful staging deployment.

## Website

1. Open `/` and confirm it renders.
2. Open `/docs`, `/blog`, and `/legal`.
3. Confirm `/dashboard` redirects correctly when signed out.
4. Sign in and confirm `/dashboard` renders.
5. Confirm `Plan & Usage` loads without crashing.
6. Confirm the dashboard points users to the browser-approved bridge flow.
7. Confirm the dashboard billing actions open the correct Clerk Billing checkout or customer portal action.
8. Confirm `/pricing` renders and `/contact` still returns the shared custom 404 page.
9. Confirm paid-plan copy and connect docs stay aligned with the local-first `.bardo/` workspace story.

## Connect Flow

1. Start a bridge session through `/api/connect/bridge-session/start`.
2. Confirm the first `/api/connect/bridge-session/poll` returns `pending`.
3. Approve it through `/api/connect/bridge-session/approve` while signed in.
4. Confirm a second `/api/connect/bridge-session/poll` returns `approved`.
5. Confirm `/api/connect/runtime-status` succeeds with the approved bridge access token.
6. Confirm missing, malformed, or expired runtime-status credentials return `200` with `valid: false` instead of a Clerk middleware `401`.
7. Confirm an unsubscribed account gets a clean denial at approval time.

## Local Runtime

From a clean local workspace:

1. Install Bardo through the release-binary flow first, not the Bun/source fallback.
2. `bardo login` completes through the browser approval flow.
3. `bardo init` completes and writes the prep artifacts under `.bardo/`.
4. `bardo connect --client <supported-client>` succeeds.
5. `bardo doctor --json` reports healthy MCP connectivity.
6. `bardo clients list --json` returns the expected client matrix.
7. `.bardo/manifests/readiness.json` and `.bardo/state/current-state.json` exist after bootstrap.
8. One runtime-status check succeeds for a paid account and returns `valid: false` for an invalid or inactive credential.

## Pre-Staging Gauntlet

Before promotion, run the destructive clean-room harness:

1. `bun run stress:test-01`
2. Confirm `/home/armando/projects/bardo-test-01/stress-report.json` exists.
3. Confirm it includes:
   - release-binary install success
   - missing and invalid rulebook failures
   - legacy `bardo/` migration success
   - `ready`, `ready-with-gaps`, and `needs-user-input` readiness cases
   - corrupted artifact fail-closed behavior
   - repeated init/connect idempotency

## Billing

1. `GET /api/billing` returns a real `creditsUsed` value.
2. Clerk Billing checkout works for the smoke user.
3. Clerk Customer Portal opens for a subscribed smoke user.
4. Subscription state gates bridge approval and protected MCP access.

## Before Promotion

Do not promote if any of these are failing:

- `bun run knip`
- React Doctor
- Vercel Doctor
- `bun run check:production-health`
- website auth flow
- Clerk Billing checkout or customer portal
- browser-approved bridge session flow
- runtime status
- release-binary install from a clean sandbox
- local workspace bootstrap into `.bardo/`
- `bardo-test-01` gauntlet coverage
- one real authenticated runtime-status request
