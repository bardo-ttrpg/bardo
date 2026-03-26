# Playwright E2E

## Local run
- Install browsers once: `cd website && bunx playwright install --with-deps chromium`
- Run smoke tests: `cd website && bun run test:e2e`
- Run authenticated dashboard/connect tests: `cd website && bun run test:e2e:auth`
- Run monorepo release gates: `cd .. && bun run test:release-gates`

## Headed mode
- `cd website && bun run test:e2e:headed`
- `cd website && bun run test:e2e:auth:headed`

## Clerk auth setup
- Use test Clerk keys only: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_*` and `CLERK_SECRET_KEY=sk_test_*`
- Provide one supported auth strategy:
  - password: `E2E_CLERK_EMAIL=...` and `E2E_CLERK_PASSWORD=...`
  - Clerk test email: `E2E_CLERK_EMAIL=your_email+clerk_test@example.com`
  - Clerk test phone: `E2E_CLERK_TEST_PHONE_NUMBER=+15555550100`
- Optional explicit test code:
  - `E2E_CLERK_TEST_VERIFICATION_CODE=424242`
- For `+clerk_test` emails and Clerk test `555` phone numbers, the Playwright helper uses Clerk's documented test code flow and does not require a real inbox or SMS.
- The authenticated Playwright project:
  - runs `clerkSetup()`
  - signs in once in `e2e/setup/clerk.setup.ts` using Clerk's supported `password`, `email_code`, or `phone_code` helper strategy
  - reuses `storageState` for `chromium-auth`

## Project layout
- `chromium` runs public and signed-out coverage.
- `setup` creates the Clerk auth state.
- `chromium-auth` runs the signed-in dashboard and bridge approval flows.

## Current coverage
- public landing, pricing, and legal routes
- signed-out `/dashboard` redirect into Clerk auth
- signed-in dashboard billing, bridge-session, and runtime-status flows
- signed-in bridge approval page

## MCP + Skills workflow
- Installed Codex skills:
  - `playwright-cli`
  - `playwright-skill`
- Codex MCP config adds `@playwright/mcp` server in `.codex/config.toml`.

Use MCP browser automation for interactive debugging and Playwright test suite for deterministic regression checks.

## Troubleshooting Linux shared libraries
- If browser launch fails with `libnspr4.so: cannot open shared object file`, install Playwright system deps:
  - `cd website && bunx playwright install-deps chromium`
- If your environment requires `sudo`, run the command in a shell with elevated privileges.
- After installing deps, rerun:
  - `cd website && bunx playwright install chromium`
  - `cd website && bun run test:e2e`
