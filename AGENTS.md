# Repository Guidelines
This is a development app, it doesn't have real users and no real data.
Make whatever changes you need to.

## Project Structure & Module Organization
This is a Bun + Turborepo monorepo with two workspaces:
- `mcp/`: Bun-based MCP server (`index.ts`, source in `mcp/src/**`).
- `website/`: Next.js marketing/product site (App Router in `website/app/**`, Convex in `website/convex/**`).

Tests are colocated with code as `*.test.ts` or `*.test.js` (for example, `mcp/src/app/middleware/auth.test.ts`). Static assets live in `public/`.

## Tech Stack
1. Bun JS (NOT Node JS).
2. Biome JS (NOT Prettier).
3. Next JS (Latest version) + Turborepo (Latest version) + TypeScript (Strict fully type-safe code).
4. Convex (Backend).
5. Clerk (Authentication).
6. Stripe (Billing).