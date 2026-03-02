---
name: sentry-setup-metrics
description: Use when the user asks to track custom metrics with Sentry, instrument counters or timings, or monitor operational behavior such as rate limits, cache hits, latency, or external dependency failures in Sentry. Trigger on requests like "track custom metrics with Sentry" or "add metrics for this auth flow".
---

# Sentry Setup Metrics

Use this skill when the user wants Sentry-backed custom metrics or wants to instrument key operational signals for a feature.

## Invoke This Skill When

- The user asks to track custom metrics with Sentry.
- The user wants counters or timings around a critical flow.
- The user wants to monitor rate limiting, cache effectiveness, latency, or backend fallbacks.

## Workflow

1. Identify the most useful signals:
   - request count
   - latency
   - cache hit or miss
   - rate-limit block
   - fallback or dependency error
2. Verify whether Sentry SDK metrics support is already configured for the runtime.
3. Add the smallest useful set of metrics with stable names and dimensions.
4. Reuse existing telemetry concepts where possible instead of inventing duplicate semantics.
5. Verify the instrumentation path and document what each metric means.

## Guardrails

- Prefer low-cardinality metric dimensions.
- Do not include user IDs, raw URLs with uncontrolled cardinality, secrets, or request payloads as metric tags.
- Instrument only the signals that change operational decisions.
- If the repo already has a stronger metrics backend, use Sentry metrics as a complement, not a replacement.

## Output Format

Always provide:

1. Metrics added or proposed.
2. Code locations updated.
3. Verification run and result.
4. How to interpret the new metrics.
