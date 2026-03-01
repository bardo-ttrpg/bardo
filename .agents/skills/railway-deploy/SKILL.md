---
name: railway-deploy
description: Use when the user wants to prepare, validate, or ship a deployment on Railway. Trigger on requests like "deploy this to Railway", "set up Railway for this service", or "make this Railway deployment ready".
---

# Railway Deploy

Use this skill when the goal is to prepare or validate a Railway deployment.

## Invoke This Skill When

- The user asks to deploy a service to Railway.
- The user needs Railway config, service setup, or deploy readiness checks.
- The user wants environment-variable or service-root guidance for Railway.

## Prerequisites

1. The `railway` MCP server is configured.
2. `RAILWAY_API_TOKEN` is available in the environment.

## Workflow

1. Inspect the repo deployment shape first:
   - monorepo vs single app
   - service root
   - build/start commands
   - runtime assumptions
2. Inspect the target Railway project and environment.
3. Verify required settings:
   - root directory
   - service variables
   - ports
   - persistent storage if needed
4. Confirm deploy prerequisites from code and docs before suggesting changes.
5. Apply the smallest deploy-config change that matches the app's real runtime.
6. Re-verify the deployment state after changes.

## Guardrails

- Do not assume Railway should mirror local dev behavior exactly.
- Do not set production defaults that contradict repo docs or runtime constraints.
- For monorepos, verify service root explicitly.

## Output Format

Always provide:

1. Target Railway service/environment.
2. Required deploy settings.
3. Files or config changed.
4. Verification result.
5. Remaining setup steps.
