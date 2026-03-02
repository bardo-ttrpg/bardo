---
name: railway-project-analysis
description: Use when the user wants a structured assessment of whether a repo, service, or monorepo is well-prepared for Railway. Trigger on requests like "analyze this project for Railway", "is this ready for Railway", or "what should I configure on Railway for this repo".
---

# Railway Project Analysis

Use this skill when the goal is to evaluate a repo or service for Railway compatibility and readiness.

## Invoke This Skill When

- The user wants a Railway-readiness review.
- The user needs a mapping from repo structure to Railway services.
- The user wants to know what variables, storage, ports, or service roots Railway needs.

## Prerequisites

1. The `railway` MCP server is configured when live project inspection is needed.
2. `RAILWAY_API_TOKEN` is available in the environment for Railway-side inspection.

## Workflow

1. Inspect the repository shape:
   - runtime
   - package manager
   - monorepo boundaries
   - persistent storage needs
2. Identify the deployable units and their service roots.
3. Determine required env vars from code, not guesses.
4. Determine whether the service is:
   - stateless
   - stateful
   - volume-dependent
5. Compare repo needs with the current Railway project, if one exists.
6. Produce a concrete Railway setup checklist.

## Guardrails

- Do not treat all services in a monorepo as one Railway service by default.
- Do not omit persistent storage requirements when the app writes local state.
- Prefer explicit env requirements sourced from code and docs.

## Output Format

Always provide:

1. Deployable units and service roots.
2. Required env vars and storage needs.
3. Risks or mismatches.
4. Recommended Railway setup.
5. Verification steps.
