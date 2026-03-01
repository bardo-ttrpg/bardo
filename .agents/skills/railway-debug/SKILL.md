---
name: railway-debug
description: Use when the user needs to debug a Railway deployment, service runtime issue, failed start, broken environment variable setup, or unhealthy production behavior. Trigger on requests like "debug this Railway service", "why is this deploy failing", or "help me fix this Railway runtime issue".
---

# Railway Debug

Use this skill when the task is to diagnose and fix a Railway service or deployment problem using Railway MCP data.

## Invoke This Skill When

- The user asks to debug a Railway service, environment, or deployment.
- A service is failing to start, crashing, or behaving incorrectly on Railway.
- The user wants help with broken env vars, startup commands, or deploy/runtime mismatches.

## Prerequisites

1. The `railway` MCP server is configured.
2. `RAILWAY_API_TOKEN` is available in the environment.

## Workflow

1. Inspect available Railway MCP tools first if the needed capability is unclear.
2. Identify the narrowest target:
   - project
   - environment
   - service
   - deployment
   - variables
   - logs
3. Gather facts before changing code or config:
   - deployment state
   - recent logs
   - service settings
   - required env vars
4. Separate platform misconfiguration from application bugs.
5. Apply the smallest fix that addresses the observed Railway failure mode.
6. Re-check the affected deployment or service state after the fix.

## Guardrails

- Do not change unrelated Railway services or environments.
- Do not guess missing env vars when repo config or service behavior can confirm them.
- Prefer fixing root cause over adding retries or restarts as a band-aid.

## Output Format

Always provide:

1. Observed Railway facts.
2. Diagnosis.
3. Files or settings changed.
4. Verification result.
5. Remaining deployment risk.
