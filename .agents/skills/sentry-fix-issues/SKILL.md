---
name: sentry-fix-issues
description: Use when the user asks to investigate, debug, or fix production errors using Sentry data. Trigger on requests like "fix the recent Sentry errors", "debug the production TypeError", "work through my Sentry backlog", or any task grounded in a Sentry issue URL, trace ID, release, or Sentry issue list.
---

# Sentry Fix Issues

Use this skill when the task depends on live Sentry data and the goal is to diagnose or fix a problem.

## Invoke This Skill When

- The user provides a Sentry issue URL or issue ID.
- The user asks to debug a production error seen in Sentry.
- The user asks to work through Sentry issues or backlog items.
- The user wants root-cause analysis, trace inspection, or release correlation using Sentry data.

## Prerequisites

1. The `sentry` MCP server is configured and authenticated.
2. Prefer Sentry facts over local guesswork for production failures.
3. If the user provides a Sentry issue URL, use it directly.

## Workflow

1. Identify the narrowest Sentry target:
   - issue URL or issue ID
   - trace ID
   - release
   - grouped issue search
   - event or count query
2. Use the matching Sentry MCP tool:
   - `get_issue_details` for a specific issue
   - `analyze_issue_with_seer` for root cause and fix guidance
   - `search_issues` for grouped issue lists
   - `search_events` for counts, logs, spans, and aggregates
   - `search_issue_events` for events inside one known issue
   - `get_trace_details` for a trace
   - `get_issue_tag_values` for breakdowns by URL, browser, environment, release, or user
   - `find_releases` for release lookup
3. Separate observed facts from inference.
4. Correlate the Sentry output with local code.
5. Apply the smallest defensible fix.
6. Run the narrowest relevant verification.
7. Report what changed and what still needs monitoring.

## Guardrails

- Do not use `search_issues` for counts or aggregates. Use `search_events`.
- Do not use `search_events` when the user wants grouped issue lists. Use `search_issues`.
- Do not alter a Sentry issue URL before passing it to the tool.
- Never claim a production issue is fixed without code evidence or a clear rationale.
- Keep fixes scoped to the Sentry-backed problem.

## Output Format

Always provide:

1. Observed Sentry facts.
2. Diagnosis or inference.
3. Relevant code locations.
4. Verification run and result.
5. Remaining risk or next step.
