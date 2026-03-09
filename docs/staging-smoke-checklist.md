# Staging Smoke Checklist

Run this after every meaningful staging deployment.

## Website

1. Open `/` and confirm it renders.
2. Open `/pricing` and `/legal`.
3. Confirm `/dashboard` redirects correctly when signed out.
4. Sign in and confirm `/dashboard` renders.
5. Confirm `Plan & Usage` loads without crashing.
6. Create an API key from the dashboard.
7. Confirm the one-time secret is shown.
8. Confirm the key appears in the paginated key list.
9. Confirm `Load more keys` appears when the account has more than one page of
   keys.
10. Rotate one key.
11. Revoke one key.
12. Generate a CLI login command.
13. Generate a connection snippet through `POST /api/connect/snippets`.

## Connect Flow

1. Start a CLI device session through `/api/connect/cli-session/start`.
2. Confirm the first `/api/connect/cli-session/poll` returns `pending`.
3. Approve it through `/api/connect/cli-session/approve`.
4. Confirm a second `/api/connect/cli-session/poll` returns `approved`.
5. Confirm `/api/connect/runtime-status` succeeds with the approved device-session key.
6. Issue a login token through `/api/connect/cli-token`.
7. Exchange that token through `/api/connect/cli-exchange`.
8. Confirm `/api/connect/runtime-status` succeeds with the exchanged key.

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
3. `POST /api/keys` creates a key for the authenticated staging user.
4. `DELETE /api/keys/:id` deletes the smoke-created key.
5. `POST /api/keys` rejects creation when billing is unavailable.
6. `POST /api/keys/revoke` enforces ownership.

## Before Promotion

Do not promote if any of these are failing:

- website auth flow
- key creation, rotate, or revoke
- CLI device-session or CLI token exchange
- runtime status
- MCP health or validate:env
- one real authenticated MCP request
