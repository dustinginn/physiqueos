# PhysiqueOS Nutrition + Activity Evidence — Founder review

Status: **complete design translation ready for Founder review; implementation not started**

This package independently audits and translates the complete Build 85 Nutrition Evidence and Activity Evidence hierarchies into the locked PhysiqueOS dark and mineral-light system. It preserves current information architecture, values, navigation, aggregation, provenance, HealthKit behavior, and historical semantics.

## Start here

- [Concise review index](comparison-board.html)
- [Coverage board — dark](screens/nutrition-activity-coverage-board.png)
- [Coverage board — mineral light](screens/nutrition-activity-coverage-board-light.png)
- `evidence-board.html` and `evidence-board.html?theme=light` for inspectable full-resolution boards

## Coverage at a glance

| Family | Direct templates | Dark | Mineral light | Explicitly mapped states | Uncovered |
|---|---:|---:|---:|---:|---:|
| Nutrition | 8 | 8 | 8 | All | 0 |
| Activity | 7 | 7 | 7 | All | 0 |

Nutrition: N1 root/latest/reporting, N2 areas/history, N3 structured day, N4 Apple Health totals-only day, N5 Calories Reporting, N6 Macros Reporting, N7 Meals Reporting, N8 load/failure/empty templates.

Activity: A1 root/latest, A2 areas/linked Training/history, A3 full day, A4 partial Apple Health day, A5 history sheet, A6 empty sections, A7 load/failure/not-found templates.

## Review documents

- [Build 85 source audit](SOURCE-AUDIT.md)
- [Independent navigation trees](NAVIGATION-TREES.md)
- [Nutrition complete coverage matrix](NUTRITION-COVERAGE-MATRIX.md)
- [Activity complete coverage matrix](ACTIVITY-COVERAGE-MATRIX.md)
- [Token/component mapping](TOKEN-COMPONENT-MAPPING.md)
- [Implementation, accessibility, and regression notes](IMPLEMENTATION-NOTES.md)
- [Parity and semantic validation](PARITY-SEMANTIC-VALIDATION.md)
- [Machine-readable validation](validation.json)

## Locked semantic boundaries

- Nutrition uses one canonical scoped day collection. Structured meals are a breakdown of the canonical day, not an additional calorie/macro total. Source labels are provenance, never additive inputs.
- Apple Health totals-only days remain valid days and never fabricate meals.
- Activity is whole-day movement evidence. Workout and non-workout calories are attribution within active calories, not extra totals.
- Build 85 Activity has no reporting destination, chart, or workout-type list; none was invented.
- Cooldown remains historical non-Cardio. Run and Stair Stepper remain canonical Cardio wherever Training/HealthKit source exposes them. This package does not reclassify workouts.
- Evidence rows remain read-only and do not inherit Logger editing affordances.

## Authority and isolation

- Prompt authority: `eb186ba2bb0862daf4f487c334ef445336bcab46`
- Exact Native authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Training Evidence accepted package: `ca088e80e851c83d0d3e168d88f918232f5338d6`
- Harness: static HTML/CSS/JS, Markdown, JSON, and rendered PNGs only
- Shipping Native UI, Server behavior, evidence contracts, HealthKit semantics, aggregation, navigation, and historical data: unchanged
