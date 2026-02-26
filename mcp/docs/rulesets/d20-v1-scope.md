# d20_v1 Scope (Frozen)

## Supported
- Action types: `skill_check`, `attack_roll`, `saving_throw`
- Target difficulty range: integer `1..40`
- Modifier range: integer `-20..20`
- Advantage modes: `none`, `advantage`, `disadvantage`
- Deterministic output shape:
  - canonical event ordering: `dice_rolled` then `mechanics_resolved`
  - outcome: `success` or `failure`
  - margin: `total - targetDifficulty`

## Non-Goals (Current)
- Full ruleset completeness for any published tabletop system
- Contested roll mechanics
- Initiative order engine
- Reaction/interrupt timing model
- Condition stack conflict resolution beyond simple modifier/advantage interpretation
- Automatic resource accounting (ammo/slots/charges)

## Unsupported Behavior Contract
- Unsupported requests return explicit `resolutionMode="unsupported"` with `unsupportedReason`
- Unsupported requests do not append canonical mechanics events
- Unsupported requests fail tool execution (`isError=true`) for fail-closed orchestrator behavior

## Determinism Guarantees
- Given same inputs and same idempotency key, replay returns identical output
- Golden scenarios must assert event ordering and projection consistency
