# Recovery Briefing V1 design artifacts

Non-shipping, review-only artifacts for Recovery Briefing V1. They do not change Server, Native, V3/Confidence, strategic Sleep, historical Briefings, or production state.

## Contents

- `recovery-briefing-v1.schema.json` — proposed immutable Server read contract.
- `zero-write-modeling-runner.mjs` — bounded production replay used under a PostgreSQL `READ ONLY` transaction with an unconditional rollback.
- `sanitized-zero-write-results.json` — aggregate-only replay output; no nightly values, raw dates, exercise names, or record payloads.
- `prototype/index.html` — self-contained visual prototype. Select a state with `?scenario=<name>`.
- `screenshots/` — nine synthetic/redacted Founder-review renders.
- `verify-artifacts.mjs` — guardrail checks for scenario coverage, no Recovery Score copy, Confidence decoupling, foam context-only semantics, and replay sanitization.

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
