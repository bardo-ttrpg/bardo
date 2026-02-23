---
name: convex-best-practices
description: Convex backend best practices for schema design, function registration, validators, queries/mutations/actions, scheduling, pagination, and file storage. Use when writing or reviewing code in `convex/**`.
user-invokable: false
---

# Convex Best Practices

Use this skill when implementing, reviewing, or refactoring Convex backend code.

## When to Apply

Apply these rules when working on:
- Convex functions (`query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`)
- `convex/schema.ts`, indexes, validators, and data modeling
- `convex/http.ts` endpoints and cron scheduling in `convex/crons.ts`
- Convex pagination, search indexes, and storage usage
- TypeScript typing around Convex IDs and return values

## Workflow

1. Identify impacted Convex files in `website/convex/**`.
2. Load `references/convex-rules.txt` and follow the relevant sections only.
3. Enforce required validators (`args` and `returns`) on every function.
4. Validate function visibility (public vs internal) and function references (`api`/`internal`).
5. Verify query/index design avoids `filter` scans and uses proper index ordering.
6. Confirm action/runtime constraints (for example, no `ctx.db` inside actions).

## High-Priority Rules

- Always use the new object-form Convex function syntax.
- Always include both `args` and `returns` validators.
- Use `returns: v.null()` for null/no-value returns.
- Register internal-only logic with `internalQuery`/`internalMutation`/`internalAction`.
- Use `api` and `internal` function references; do not pass functions directly to `ctx.run*`.
- Prefer indexed access with `withIndex`; avoid query `filter` scans.
- Use `v.int64()` (not deprecated `v.bigint()`).
- Keep schema definitions in `convex/schema.ts` with clear index naming.
- In actions, do not use `ctx.db`; use queries/mutations via `ctx.runQuery`/`ctx.runMutation` when needed.

## Reference

Primary guide: `references/convex-rules.txt`

If the reference file is large, jump to sections by heading names:
- `Function guidelines`
- `Validator guidelines`
- `Schema guidelines`
- `Query guidelines`
- `Mutation guidelines`
- `Action guidelines`
- `Scheduling guidelines`
- `File storage guidelines`
