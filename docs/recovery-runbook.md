# Recovery Runbook

Use this when staging or production behavior drifts from the frozen local-first contract.

## Failed bootstrap

Symptoms:
- `bardo init` fails
- `.bardo/manifests/readiness.json` is missing
- rules bootstrap or campaign bootstrap outputs are partial

Checks:
1. Confirm `rulebook.md` exists at the workspace root, or confirm the operator intentionally passed `--rulebook`.
2. Inspect `.bardo/rules/rulebook.md` and `.bardo/rules/normalized/index.json`.
3. Inspect `.bardo/manifests/source-index.json` and `.bardo/manifests/readiness.json`.
4. Run `bardo doctor --json` and capture the output with the workspace path.

Recovery:
1. Fix the missing or invalid rulebook input first.
2. Remove only the incomplete generated artifacts under `.bardo/` if the failure happened mid-bootstrap.
3. Re-run `bardo init`.
4. If the workspace has contradictory notes, preserve them and resolve the readiness gaps instead of force-editing generated state.

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
2. Confirm the user has the required plan and entitlements.
3. Confirm `/api/connect/bridge-session/start`, `/poll`, `/approve`, and `/refresh` are healthy in staging logs.

Recovery:
1. Retry the browser approval flow from `bardo login`.
2. If approval still fails, invalidate the bridge session and start a new one.
3. Do not hand-edit saved bridge tokens unless incident response explicitly calls for it.

## Runtime-status outage

Symptoms:
- `bardo doctor --json` health succeeds but account status fails
- dashboard plan usage panels degrade

Checks:
1. Confirm `/api/connect/runtime-status` is reachable.
2. Confirm access tokens are being sent and validated server-side.
3. Confirm the website still serves the correct API key introspection and auth configuration.

Recovery:
1. Keep local `.bardo/` truth untouched.
2. Restore the hosted status path or token validation path.
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
