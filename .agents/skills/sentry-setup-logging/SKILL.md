---
name: sentry-setup-logging
description: Use when the user asks to enable Sentry logging, capture application logs in Sentry, or improve log visibility around errors and production debugging. Trigger on requests like "enable Sentry logging", "send logs to Sentry", or "add structured logging for Sentry investigation".
---

# Sentry Setup Logging

Use this skill when the user wants Sentry to ingest logs or wants code changes that improve log usefulness for Sentry-driven debugging.

## Invoke This Skill When

- The user asks to enable Sentry logging.
- The user wants logs correlated with Sentry issues.
- The user wants better production diagnostics around errors, rate limits, or external dependency failures.

## Workflow

1. Identify the runtime:
   - Next.js / browser
   - Node / Bun server
   - mixed app
2. Verify whether Sentry SDK is already installed and configured.
3. Enable Sentry logging using the official SDK path for that runtime.
4. Improve log quality:
   - use structured fields
   - include operation names and safe identifiers
   - exclude secrets, API keys, auth tokens, and PII
5. Correlate logs with the relevant request or issue context when possible.
6. Run targeted verification and summarize what was enabled.

## Guardrails

- Prefer official Sentry SDK configuration over ad hoc transports.
- Never log secrets, bearer tokens, raw API keys, or request bodies with sensitive data.
- Keep log fields stable and machine-readable.
- Add logs only where they improve diagnosis; avoid noisy blanket logging.

## Output Format

Always provide:

1. Logging configuration added or changed.
2. Code locations updated.
3. Verification run and result.
4. Follow-up monitoring recommendation.
