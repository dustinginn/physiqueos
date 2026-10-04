# PhysiqueOS Training Evidence — Founder review

Status: **accepted and locked; implementation not started**

This disposable design harness translates the complete Build 85 Training Evidence hierarchy into the locked PhysiqueOS visual language. It is a styling proposal, not an information-architecture or data redesign. Every key product screen is rendered in dark and mineral-light with identical content and geometry.

## Start here

- [Review index](comparison-board.html)
- [Coverage board — dark](screens/training-evidence-coverage-board.png)
- [Coverage board — mineral light](screens/training-evidence-coverage-board-light.png)
- [Focused Training Areas — all 10, dark](screens/training-areas-all-10.png)
- [Focused Training Areas — all 10, mineral light](screens/training-areas-all-10-light.png)
- `training-evidence-board.html` and `training-evidence-board.html?theme=light` for inspectable full-resolution boards

## Review documents

- [Source audit](SOURCE-AUDIT.md)
- [Navigation tree](NAVIGATION-TREE.md)
- [Complete coverage matrix](COVERAGE-MATRIX.md)
- [Token and component mapping](TOKEN-COMPONENT-MAPPING.md)
- [Implementation, accessibility, and regression notes](IMPLEMENTATION-NOTES.md)
- [Automated parity validation](validation.json)

## Key full-resolution screens

Dark files use the listed name; mineral-light adds `-light` before `.png`.

- Root: `screens/training-evidence-t1.png`, `training-evidence-t2.png`
- Day: `screens/training-evidence-t3.png`
- Session: `screens/training-evidence-t4.png`, `training-evidence-t5.png`, `training-evidence-t6.png`
- Exercise: `screens/training-evidence-t7.png`, `training-evidence-t8.png`, `training-evidence-t11.png`
- Records: `screens/training-evidence-t9.png`, `training-evidence-t10.png`
- Additional current routes/states: `screens/training-evidence-t12.png` through `training-evidence-t16.png`

## Review map

| Depth | Mockups | What they prove |
|---|---|---|
| Root | T1, T2 | Training landing, scope, mixed chronological history, strength/cardio distinction |
| Day | T3 | Multiple sessions remain in current order and one grouped day surface |
| Session | T4, T5, T6 | Read-only structured strength, superset/variant/timed/BW, Apple Health cardio detail |
| Exercise | T7, T8, T11 | Benchmark, last session, current records, expanded historical set table |
| Records | T9, T10 | Exact Session Volume and Reps-at-Load semantics and deltas |
| Additional routes | T12–T16 | Load/empty/error, Resistance Reporting, History Reporting, shared Foundation placeholder, Library/Area browse |

## Authority and isolation

- Prompt authority: `2bae36cfa5f3364880abf8966800c658bd30aafc`
- Shipping Native authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85
- Harness: static HTML/CSS/JS, Markdown documentation, and rendered PNGs only
- Shipping Native UI, Server behavior, evidence contracts, HealthKit semantics, canonical exercise identity, record semantics, navigation, and historical data: unchanged

Watch, Live Activity / Dynamic Island, and Logger remain locked. This package does not reopen or modify those families.

## Founder lock clarification

Training Areas preserves the exact current-production list, order, identities, and counts: Chest (7), Back (4), Shoulders (8), Biceps (3), Triceps (3), Core (3), Quads (18), Hamstrings (4), Glutes (3), Calves (1). The compact two-column treatment never buckets, merges, prioritizes, paginates, or hides any area.
