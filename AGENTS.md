# Repository Guidelines

## Project Structure & Module Organization
This is a Bun + Turborepo monorepo with two workspaces:
- `mcp/`: Bun-based MCP server (`index.ts`, source in `mcp/src/**`).
- `website/`: Next.js marketing/product site (App Router in `website/app/**`, Convex in `website/convex/**`).

Tests are colocated with code as `*.test.ts` or `*.test.js` (for example, `mcp/src/app/middleware/auth.test.ts`). Static assets live in `public/`.

## Build, Test, and Development Commands
Run from repository root unless noted:
- `bun install`: install dependencies for all workspaces.
- `bun run dev`: run MCP and website in parallel via Turbo.
- `bun run dev:mcp`: run only MCP (port `3000`).
- `bun run dev:website`: run only website (port `3001`).
- `bun run build`: build all workspaces.
- `bun run lint`: run Biome checks in all workspaces.
- `bun run typecheck`: run TypeScript checks.
- `bun run test`: run unit tests.
- `bun run check`: combined lint + typecheck pipeline.

## Coding Style & Naming Conventions
- Language: TypeScript/ESM across the repo.
- Formatter/linter: Biome (`biome.json`), with tab indentation and import organization enabled.
- Use descriptive, small modules; keep route/tool entry points thin and move logic to focused helpers.
- File naming follows existing patterns: kebab-case files (for example, `request-guards.ts`), tests as `*.test.ts|js`, and Next route handlers as `route.ts`.
- Do not hand-edit generated Convex files in `website/convex/_generated/**`.

## Testing Guidelines
- Test runner: Bun (`bun test`).
- Place tests next to implementation and mirror filename patterns (`foo.ts` -> `foo.test.ts`).
- Add or update tests for behavior changes, especially auth, request bounds, rate limiting, billing, and webhook flows.
- Before opening a PR, run: `bun run check && bun run test`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat:`, `fix(scope):`, `perf(scope):`, `chore:`, `refactor:`.
- Keep commits focused and explain intent, not just mechanics.
- PRs should complete `.github/pull_request_template.md`:
  - concise summary of what changed and why,
  - passing lint/typecheck,
  - security/reliability checklist,
  - Greptile review status and resolution notes.
