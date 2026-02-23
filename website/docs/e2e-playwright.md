# Playwright E2E

## Local run
- Install browsers once: `cd website && bunx playwright install --with-deps chromium`
- Run smoke tests: `cd website && bun run test:e2e`
- Run monorepo release gates: `cd .. && bun run test:release-gates`

## Headed mode
- `cd website && bun run test:e2e:headed`

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
