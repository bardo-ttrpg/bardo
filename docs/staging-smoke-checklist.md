# Staging Smoke Checklist

Run this after every meaningful staging deployment.

## Website

1. Open `/` and confirm it renders.
2. Open `/pricing` and `/legal`.
3. Confirm `/dashboard` redirects correctly when signed out.
4. Sign in and confirm `/dashboard` renders.
5. Create an API key from the dashboard.
6. Confirm the key appears in the paginated key list.
7. Confirm `Load more keys` appears when the account has more than one page of
   keys.
8. Rotate one key.
9. Revoke one key.
10. Generate a CLI login command.
11. Generate a connection snippet through `POST /api/connect/snippets`.

## Connect Flow

1. Start a CLI device session through `/api/connect/cli-session/start`.
2. Poll it through `/api/connect/cli-session/poll`.
3. Approve it through `/api/connect/cli-session/approve`.
4. Exchange the resulting login token through `/api/connect/cli-exchange`.
5. Confirm `/api/connect/runtime-status` succeeds with the exchanged key.

## MCP

1. `GET /health` returns `200`.
2. `bun run --cwd mcp validate:env` passes.
3. Unauthenticated `POST /mcp` returns an auth error.
4. Authenticated `POST /mcp` succeeds for one representative flow.
5. `/metrics` behaves according to the current metrics auth policy.

## Local Runtime

From a clean local workspace:

1. `bardo connect --client <supported-client>` succeeds.
2. `bardo doctor --json` reports healthy MCP connectivity.
3. `bardo clients list --json` returns the expected client matrix.
4. One workspace bootstrap creates the expected `bardo/` structure.

## Billing and Keys

1. `GET /api/billing` returns a real `creditsUsed` value.
2. `GET /api/keys?limit=20&offset=0` returns page metadata.
3. `POST /api/keys` rejects creation when billing is unavailable.
4. `POST /api/keys/revoke` enforces ownership.

## Before Promotion

Do not promote if any of these are failing:

- website auth flow
- key creation or revoke
- runtime status
- MCP health or validate:env
- one real authenticated MCP request
