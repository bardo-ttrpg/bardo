# Release Candidate Checklist

Use this before calling a build staging-ready.

## Freeze the surface

1. Confirm the frozen product surface still matches the contract:
   - `bardo login`
   - `bardo init`
   - `bardo connect`
   - `.bardo/` as the only managed steady-state root
   - `/api/connect/*`, `/api/auth/introspect-key`, and `/api/billing`
   - runtime MCP tools `init`, `scene_turn`, `player_action`, `world_sync`, `simulation_tick`
2. Confirm any compatibility logic is migration-only, not a second steady-state path.

## Release artifacts

1. Bump [`/home/armando/projects/bardo/packages/bardo-mcp/package.json`](/home/armando/projects/bardo/packages/bardo-mcp/package.json) intentionally.
2. Review [`/home/armando/projects/bardo/bun.lock`](/home/armando/projects/bardo/bun.lock) and confirm the lockfile diff is intentional.
3. Run `bun run --cwd packages/bardo-mcp build:release` so the release binaries under `packages/bardo-mcp/dist/release/` are fresh for the version being shipped.
4. Confirm `SHA256SUMS.txt` matches the freshly built binaries.
5. Upload every file in `packages/bardo-mcp/dist/release/` to the public Vercel Blob release prefix used by `BARDO_MCP_PUBLIC_RELEASES_BASE_URL`.
6. Confirm both installers reference the public release prefix and can fetch `SHA256SUMS.txt`, not private GitHub release assets.
7. Draft release notes before promotion. Call out install changes, `.bardo` migration notes, any user-visible runtime behavior changes, and rollback guidance.

## Validation gates

1. Run `bun run knip`.
2. Run `bun run check:react-doctor`.
3. Run `bun run check:vercel-doctor`.
4. Run `bun run check:production-health`.
5. Run `bun run test:release-gates`.
6. Run `bun run bundle:audit`.
7. Run `bun run stress:test-01`.
8. Run `bun run staging:smoke` against the real staging deployment after env validation.
9. Re-run the Replacement Audit Plan and do not waive blocking findings.

## Promotion decision

Promote only if all of these are true:

- the packaged install flow succeeds from a clean environment
- macOS/Linux and Windows install scripts both fetch the public release binary and verify the checksum
- `bardo-test-01` passes without canon drift or unsafe commits
- staging hosted routes behave correctly for connect, auth introspection, billing, approval, and runtime status
- docs and operator runbooks still match the shipped behavior
