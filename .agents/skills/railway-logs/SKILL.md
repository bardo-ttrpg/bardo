---
name: railway-logs
description: Use when the user wants to inspect Railway logs to understand deploy failures, runtime crashes, startup issues, or request behavior. Trigger on requests like "check the Railway logs", "why did this service crash", or "inspect deploy logs".
---

# Railway Logs

Use this skill when the task depends on Railway log output.

## Invoke This Skill When

- The user asks to inspect Railway logs.
- A deployment failed and the likely answer is in startup or runtime logs.
- The user needs to correlate application errors with Railway deploys or restarts.

## Prerequisites

1. The `railway` MCP server is configured.
2. `RAILWAY_API_TOKEN` is available in the environment.

## Workflow

1. Identify the exact Railway target:
   - project
   - environment
   - service
   - deployment window
2. Pull the narrowest relevant logs.
3. Distinguish:
   - build failure
   - startup failure
   - runtime crash
   - app-level warning/error
4. Correlate logs with local code and config.
5. If a fix is needed, keep it scoped to the logged failure.

## Guardrails

- Do not infer root cause from one log line if adjacent context is available.
- Prefer recent logs that match the deployment or incident window.
- Avoid dumping excessive raw logs when a precise excerpt or summary is enough.

## Output Format

Always provide:

1. Relevant log findings.
2. Diagnosis.
3. Code or config locations involved.
4. Verification result.
5. Remaining uncertainty, if any.
