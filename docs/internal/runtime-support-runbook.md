# Runtime Support Runbook

This document is internal-only. Do not mirror this detail onto the public website.

## Primary recovery artifacts

- `.bardo/manifest.json`
- `.bardo/state/current-state.json`
- `.bardo/events/state-changes.ndjson`
- `.bardo/snapshots/index.json`
- `.bardo/manifests/diagnostics.json`
- `.bardo/manifests/conflicts.json`

## First response checklist

1. Build the diagnostics bundle from the local runtime helpers.
2. Compare `latestStateHash` with a fresh replay hash.
3. Check unresolved conflicts and duplicate candidates.
4. If a correction is suspected, inspect correction linkage before attempting recovery.

## Recovery cases

### Corrupted artifact

- Fail closed.
- Migrate only if the artifact version is supported.
- Verify replay hash convergence before accepting the migrated artifact set.

### Replay failure

- Re-run replay from event zero.
- Re-run replay from the latest snapshot.
- If the hashes diverge, isolate the first event after the last valid snapshot.

### Duplicate entity cleanup

- Prefer merge corrections when names/aliases clearly converge.
- Prefer split corrections when one merged entity is carrying aliases from two distinct canon subjects.
- After cleanup, re-check duplicate candidates in the diagnostics bundle.

### Interrupted correction

- Confirm whether the correction event committed.
- If it committed, replay from the correction point before any further repair.
- If it did not commit, do not manually edit runtime artifacts; re-issue a structured correction.
