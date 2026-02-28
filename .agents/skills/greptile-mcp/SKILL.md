---
name: greptile-mcp
description: Use Greptile MCP for code review and iterative fix loops. Trigger when the user asks to run check-pr, resolve review comments, perform greploop-style fix cycles, or validate PR readiness with structured findings.
---

# Greptile MCP Skill

Use this skill when a user wants Greptile-driven code review, comment resolution, or iterative quality loops.

## Prerequisites

1. Greptile MCP server is configured and authenticated.
2. The current branch is pushed when reviewing a PR/remote branch.
3. Work is scoped to the user request; do not modify unrelated files.

## Workflow

1. Discover tool names via MCP `tools/list` first.
2. Map requested intent to available Greptile tools (do not assume hardcoded names).
3. Execute one of the two primary workflows below.
4. Apply fixes locally.
5. Re-run Greptile checks to confirm reduction/closure of findings.
6. Report outcome with file references and residual risks.

## Workflow A: check-pr style review

Use for: "review this PR", "run Greptile review", "what findings remain".

1. Gather branch/PR context.
2. Run the Greptile review tool for that target.
3. Classify findings by severity:
   - correctness/bugs
   - security
   - regressions
   - performance
   - maintainability
4. Fix high/medium issues first.
5. Re-run review and show delta (before/after counts).

## Workflow B: greploop style iterations

Use for: "continue fixing until green", "loop until no blockers".

1. Set bounded loop (default max 5 iterations unless user asks otherwise).
2. Each iteration:
   - run Greptile review
   - select top actionable items
   - patch code
   - run relevant tests/checks
3. Stop when:
   - no actionable findings remain, or
   - only accepted low-priority findings remain, or
   - loop cap reached.
4. Return closed items, remaining items, and next actions.

## Guardrails

- Never mark a finding fixed without either code change or explicit, evidence-based rationale.
- Keep fixes minimal and targeted.
- Avoid speculative refactors during loop runs.
- If Greptile feedback conflicts with repository rules, follow repository rules and explain why.

## Output Format

Always provide:

1. Findings addressed (ordered by severity) with file references.
2. Verification run (tests/lint/typecheck) and pass/fail.
3. Remaining findings (if any) with rationale.
4. Recommended next step.
