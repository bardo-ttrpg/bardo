# Architecture Reference

This skill uses four dependency categories to describe what a deeper module would need to hide:

1. **Pure domain dependencies**
   Deterministic code, types, validation, and business rules that can stay inside the module boundary.

2. **Local infrastructure dependencies**
   Filesystem access, local persistence, caches, framework helpers, or package-local utilities that the module can own behind a narrow interface.

3. **External boundary dependencies**
   Network calls, third-party SDKs, queues, databases, and other cross-process integrations that usually benefit from ports and adapters.

4. **Workflow and orchestration dependencies**
   Multi-step coordination across modules, retries, time-based behavior, and state transitions where the real risk lives in sequencing instead of any single function.

When comparing interface options, call out which category dominates the design. That usually tells you where the interface should stay small and where the implementation should absorb complexity.

## RFC Issue Template

Use this structure when creating the GitHub issue:

```md
## Summary

Describe the architectural problem in one short paragraph.

## Why This Area Is Coupled

- List the modules involved
- Explain the shared concepts, types, or call flows
- Note the dominant dependency category

## Current Friction

- Describe the navigation, ownership, or testing pain
- Mention the seams where bugs are likely to hide

## Proposed Deep Module Boundary

- Name the module or boundary to deepen
- Describe the responsibilities it should absorb
- Keep the public interface intentionally small

## Dependency Strategy

- Which dependencies stay inside the module
- Which dependencies need ports, adapters, or wrappers
- Which orchestration concerns should move behind the boundary

## Testing Impact

- Which shallow unit tests can be removed
- Which boundary or integration tests become the main safety net

## Migration Plan

1. Define the new boundary
2. Move logic behind the interface
3. Update callers incrementally
4. Replace obsolete tests

## Success Criteria

- Fewer cross-module hops to understand the feature
- Smaller public surface area
- Clearer ownership
- Tests focused on behavior at the boundary

## Open Questions

- Any unresolved trade-offs or rollout concerns
```
