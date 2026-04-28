# Recovery Runbook

Use this when staging or production behavior drifts from the frozen local-first contract.

## Failed bootstrap

Symptoms:
- `bardo init` fails
- `.bardo/manifests/readiness.json` is missing
- rules bootstrap or campaign bootstrap outputs are partial
- `.bardo/` was deleted or is otherwise missing after the workspace was already in use

Checks:
1. Confirm `rulebook.md` exists at the workspace root, or confirm the operator intentionally passed `--rulebook`.
2. Inspect `.bardo/rules/rulebook.md` and `.bardo/rules/normalized/index.json`.
3. Inspect `.bardo/manifests/source-index.json` and `.bardo/manifests/readiness.json`.
4. Run `bardo doctor --json` and capture the output with the workspace path.

Recovery:
1. Fix the missing or invalid rulebook input first.
2. If `.bardo/` is missing, treat the workspace as uninitialized. Bardo should fail closed until bootstrap is run again.
3. Remove only the incomplete generated artifacts under `.bardo/` if the failure happened mid-bootstrap.
4. Re-run `bardo init`.
5. If the workspace has contradictory notes, preserve them and resolve the readiness gaps instead of force-editing generated state.

## Failed migration

Symptoms:
- legacy `bardo/` still exists after init
- expected files did not move into `.bardo/`

Checks:
1. Confirm `.bardo/` does not already exist before retrying migration.
2. Inspect whether the old `bardo/` tree contains user-managed files that should remain untouched.
3. Review the workspace root for symlinks or permissions that could block a rename.

Recovery:
1. Copy the workspace before manual intervention.
2. Move the legacy `bardo/` tree to `.bardo/` only once.
3. Re-run `bardo init` and confirm no new legacy root is recreated.

## Bridge approval failure

Symptoms:
- `bardo login` does not complete
- `/api/connect/bridge-session/approve` fails
- `bardo doctor --json` shows auth configured but account check fails

Checks:
1. Confirm the website session is authenticated.
2. Confirm the user has the required plan and entitlements. During the legacy billing migration, Clerk `solo` is treated as Pro-equivalent access.
3. Confirm hosted bridge storage is durable. Vercel production should use `BARDO_WEBSITE_BACKEND_DRIVER=convex` with `CONVEX_URL` or `NEXT_PUBLIC_CONVEX_URL` plus `BARDO_CONVEX_BACKEND_SECRET`; `/tmp` backend paths and in-memory fallbacks are not safe for bridge sessions.
4. Confirm `/api/connect/bridge-session/start`, `/poll`, `/approve`, and `/refresh` are healthy in staging logs.
5. Treat unauthenticated `curl` POSTs to `/api/connect/bridge-session/approve` returning `401 Unauthorized` as expected. That endpoint must be called by a signed-in browser session.

Recovery:
1. Retry the browser approval flow from `bardo login`.
2. If polling says `expired` or `not found`, verify the deployment is using the Convex backend instead of `/tmp` or in-memory session state, then start a new bridge session after the durable backend is healthy.
3. If approval reports missing subscription for a paid legacy account, verify `CLERK_BILLING_PLAN_SOLO` or Clerk `has({ plan: "solo" })` is available to the route.
4. Do not hand-edit saved bridge tokens unless incident response explicitly calls for it.

## Runtime-status outage

Symptoms:
- `bardo doctor --json` health succeeds but account status fails
- dashboard plan usage panels degrade

Checks:
1. Confirm `/api/connect/runtime-status` is reachable.
2. Confirm access tokens are being sent and validated server-side.
3. Confirm the website still serves the correct API key introspection and auth configuration.
4. Confirm invalid credentials return `200` with `valid: false`; `401` responses on this route usually mean Clerk middleware is intercepting a custom bridge token before the handler runs.

Recovery:
1. Keep local `.bardo/` truth untouched.
2. Restore the hosted status path, token validation path, or proxy bypass for custom-token connect routes.
3. Re-run `bardo doctor --json` after recovery and confirm account status resumes without changing local canon.

## Partial hosted degradation

Symptoms:
- billing works but bridge approval fails
- auth works but billing or status is degraded

Checks:
1. Isolate the failing route family: connect, billing, auth introspection, or dashboard/runtime status.
2. Confirm secrets are present only server-side and that env values match the intended deployment.
3. Confirm the website client bundle does not contain local engine code or secrets.

Recovery:
1. Prefer route-level rollback or env rollback over application-wide rollback when possible.
2. Keep the local bridge/runtime path operational if only hosted account features are degraded.
3. Re-run `bun run staging:smoke` and the affected focused checks before re-enabling promotion.
