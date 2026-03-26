# Staging Smoke Checklist

Run this after every meaningful staging deployment.

## Website

1. Open `/` and confirm it renders.
2. Open `/pricing` and `/legal`.
3. Confirm `/dashboard` redirects correctly when signed out.
4. Sign in and confirm `/dashboard` renders.
5. Confirm `Plan & Usage` loads without crashing.
6. Confirm the dashboard points users to the browser-approved bridge flow.
7. Confirm the pricing page opens the correct Clerk Billing checkout or customer portal action.
8. Confirm paid-plan copy and connect docs stay aligned with the remote-MCP-plus-local-workspace story.

## Connect Flow

1. Start a bridge session through `/api/connect/bridge-session/start`.
2. Confirm the first `/api/connect/bridge-session/poll` returns `pending`.
3. Approve it through `/api/connect/bridge-session/approve` while signed in.
4. Confirm a second `/api/connect/bridge-session/poll` returns `approved`.
5. Confirm `/api/connect/runtime-status` succeeds with the approved bridge access token.
6. Confirm an unsubscribed account gets a clean denial at approval time.

## MCP

1. `GET /health` returns `200`.
2. `bun run --cwd mcp validate:env` passes.
3. Unauthenticated `POST /mcp` returns an auth error.
4. Authenticated `POST /mcp` succeeds for one representative protected flow.
5. `/metrics` behaves according to the current metrics auth policy.

## Local Runtime

From a clean local workspace:

1. `bardo login` completes through the browser approval flow.
2. `bardo connect --client <supported-client>` succeeds.
3. `bardo doctor --json` reports healthy MCP connectivity.
4. `bardo clients list --json` returns the expected client matrix.
5. One workspace bootstrap creates the expected `bardo/` structure.
6. One protected MCP tool call succeeds for a paid account and fails cleanly for an unpaid one.

## Billing

1. `GET /api/billing` returns a real `creditsUsed` value.
2. Clerk Billing checkout works for the smoke user.
3. Clerk Customer Portal opens for a subscribed smoke user.
4. Subscription state gates bridge approval and protected MCP access.

## Before Promotion

Do not promote if any of these are failing:

- website auth flow
- Clerk Billing checkout or customer portal
- browser-approved bridge session flow
- runtime status
- MCP health or validate:env
- one real authenticated MCP request
