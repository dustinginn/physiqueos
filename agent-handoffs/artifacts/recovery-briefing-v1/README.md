# Recovery Briefing V1 design artifacts

Non-shipping, review-only artifacts for Recovery Briefing V1. The revised prototype uses exactly one Recovery card: status, period Sleep average, personal-baseline comparison, trend, optional inline commentary, and a lightweight foam-rolling row all live in that card. There is no Recovery-specific hero or nested commentary card. These artifacts do not change Native, V3/Confidence, strategic Sleep, historical Briefings, or production state.

## Contents

- `recovery-briefing-v1.schema.json` — versioned, shadow-only assessment contract.
- `zero-write-modeling-runner.mjs` — bounded production replay used under a PostgreSQL `READ ONLY` transaction with an unconditional rollback.
- `sanitized-zero-write-results.json` — aggregate-only replay output; no nightly values, raw dates, exercise names, or record payloads.
- `prototype/index.html` — self-contained one-card visual prototype. Select a state with `?scenario=<name>`.
- `screenshots/` — nine synthetic/redacted Founder-review renders of the one-card hierarchy.
- `verify-artifacts.mjs` — guardrail checks for one-card rendering, no Recovery Score copy, Confidence decoupling, shadow-only/persistence-free behavior, foam context-only semantics, non-causal training context, and replay sanitization.

The executable Server candidate is deliberately repository-free and unwired:

- `src/domain/services/RecoveryBriefingPolicyV1.js`
- `src/domain/services/RecoveryBriefingAssessmentServiceV1.js`
- `src/domain/services/RecoveryBriefingShadowServiceV1.js`

The shadow entry point fails closed unless a separate explicit `recovery_shadow_input_authority_v1` is supplied. This change does not install that authority, create a schedule, add persistence, or expose a client read path.

## Prototype scenarios

1. `weekly-green`
2. `weekly-yellow`
3. `weekly-red`
4. `midweek-green`
5. `monthly-yellow`
6. `insufficient-data`
7. `green-imperfect-foam`
8. `yellow-training-holds`
9. `red-corroborated`

Run the local artifact verification with:

```sh
node agent-handoffs/artifacts/recovery-briefing-v1/verify-artifacts.mjs
```
