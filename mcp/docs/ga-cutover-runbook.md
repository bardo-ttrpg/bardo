# Bardo MCP GA Cutover Runbook

## Purpose
Release the canonical event-sourced runtime with strict canonical mode enabled, while keeping migration and rollback operationally safe.

## Preconditions
- Production environment variables are set using `mcp/.env.example` as baseline.
- `BARDO_STRICT_CANONICAL_MODE=true` in release environment.
- Gameplay tool profile does not expose admin migration paths.
- All GA gates are green:
  - `bun run check`
  - `bun test`
  - `bun run test:ga-gates`
  - root combined gate: `bun run test:release-gates`

## Step 1: Pre-cutover Backup
1. Snapshot campaign workspace directories:
   - `state/`
   - `events/`
   - `projections/`
   - `manifests/`
2. Save snapshot artifact ID in deployment notes.

## Step 2: Dry-run Migration Validation
1. Run `migrate_legacy_state` with `dryRun=true` and unique idempotency key.
2. Confirm result:
   - `report.status = "dry_run"`
   - `report.errors` is empty
   - projected canonical append count is expected.

## Step 3: Execute Migration
1. Run `migrate_legacy_state` with `dryRun=false` and unique idempotency key.
2. Confirm result:
   - `success=true`
   - `migrated=true` or explicit `skipped` with rationale.
   - `report.errors` is empty.

## Step 4: Post-migration Verification
1. Verify canonical log exists and replays:
   - `events/canonical.ndjson`
2. Verify projections regenerate successfully:
   - run `regenerate_projection` for `current_state`
3. Verify consistency:
   - run `consistency_check`
4. Verify strict-mode gameplay path:
   - orchestrated turn with `player_action`
   - optional `world_sync` + `simulation_tick`

## Step 5: Strict-mode and Policy Validation
1. Confirm strict-mode blocks legacy fallback paths.
2. Confirm policy violations emit `runtime_policy_blocked`.
3. Confirm no gameplay profile access to `migrate_legacy_state`.

## Rollback Criteria
Rollback immediately if any are true:
- Canonical replay fails.
- Projection regeneration fails for required projections.
- `consistency_check` returns errors that cannot be remediated quickly.
- Orchestrator path returns false-success under strict mode.

## Rollback Procedure
1. Stop write traffic to affected campaign workspace.
2. Restore backup snapshot for:
   - `state/`
   - `events/`
   - `projections/`
   - `manifests/`
3. Re-run verification:
   - `consistency_check`
   - one orchestrated turn
4. Record incident with failing step, tool path, and error details.

## Evidence to Archive Per Cutover
- Backup artifact ID
- Migration tool output (`report`)
- Consistency check output
- Strict-mode orchestrator validation output
- Final GA readiness command output:
  - `bun run ga:readiness`
