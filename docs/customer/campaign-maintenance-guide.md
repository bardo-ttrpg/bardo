# Customer Campaign Maintenance Guide

This guide is for paying operators maintaining real Bardo workspaces. It is intentionally operational and does not document internal validator or replay mechanics.

## What to check first

1. Open `.bardo/manifests/readiness.json` and confirm the workspace is not `needs-user-input`.
2. Open `.bardo/manifests/diagnostics.json` and confirm `latestStateHash` is present.
3. If play was blocked, inspect `.bardo/manifests/conflicts.json` for unresolved conflicts.

## Safe maintenance habits

- Keep campaign notes outside `.bardo/`.
- Prefer explicit `user_correction` over chat-only clarifications.
- Re-run bootstrap after major prep changes.
- Treat `.bardo/snapshots/` and `.bardo/events/state-changes.ndjson` as recovery-critical local artifacts.

## When continuity looks wrong

- Check the latest turn trace in `.bardo/logs/turn-trace.ndjson`.
- Confirm the expected correction was committed in `.bardo/events/state-changes.ndjson`.
- If needed, contact support with the diagnostics bundle and the last few event ids instead of sharing the whole workspace first.
