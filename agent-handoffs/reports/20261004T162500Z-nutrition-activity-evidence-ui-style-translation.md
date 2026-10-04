# Nutrition + Activity Evidence UI style translation — complete

Date: 2026-10-04 16:25 UTC
Status: **complete review package; Founder review next; implementation not started**

## Authority

- Prompt authority: `eb186ba2bb0862daf4f487c334ef445336bcab46`
- Exact Native authority audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Accepted Training Evidence package: `ca088e80e851c83d0d3e168d88f918232f5338d6`
- Work branch: `codex/nutrition-activity-evidence-design`
- Artifact commit: `33ea64910c505cdf068909181c5317dadf6a0d5a`
- Artifact root: `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/`

## Outcome

The complete current Nutrition Evidence and Activity Evidence navigation hierarchies were audited independently before design. Fifteen direct templates cover every materially distinct route and state, with all near-identical states explicitly mapped in the two complete matrices.

The translation is intentionally conservative:

- information architecture, order, data density, values, routes, drill-down behavior, aggregation, provenance, HealthKit semantics, strategic eligibility, and historical behavior are unchanged;
- Nutrition uses one canonical scoped day collection; structured meals are a reconciled breakdown, not a second total, and source labels never imply additive counting;
- Apple Health totals-only Nutrition days remain valid without fabricated meals;
- Activity retains its exact whole-day/eight-metric model and gains no reporting route, chart, or workout classifier;
- workout/non-workout Activity calories remain attribution inside active energy, not extra totals;
- Cooldown remains historical non-Cardio; Run and Stair Stepper retain Cardio identity under canonical Training/HealthKit authority;
- no charts, coaching, targets, scores, actions, correction flows, or routes were invented;
- Evidence rows remain read-only and never resemble Logger inputs or Done controls.

## Training Evidence lock clarification

Training Evidence is accepted and locked. Its Training Areas section now visibly proves all 10 exact live-app areas and counts in dark and mineral light:

Chest 7, Back 4, Shoulders 8, Biceps 3, Triceps 3, Core 3, Quads 18, Hamstrings 4, Glutes 3, Calves 1.

No area is bucketed, merged, prioritized, paginated, or hidden. Focused proof:

- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/screens/training-areas-all-10.png`
- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/screens/training-areas-all-10-light.png`

## Independent hierarchy summaries

Nutrition:

Evidence Hub → Nutrition root/history → Latest Nutrition Day / three Reporting routes / six informational Areas / Recent History → Nutrition Day or reporting sheets. Reporting retains only Calories, Macros, and Meals with their existing controls, charts, lists, and sheets.

Activity:

Evidence Hub → Activity root/history → Today/Latest Activity Day / four informational Areas / non-navigating Linked Training Context / Recent History → Activity Day. No Activity Reporting or workout-detail hierarchy exists in Build 85.

Exact trees: `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/NAVIGATION-TREES.md`.

## Complete coverage

- Nutrition direct templates: 8; dark renders: 8; mineral-light renders: 8.
- Activity direct templates: 7; dark renders: 7; mineral-light renders: 7.
- Explicitly mapped current states: all.
- Uncovered current states: 0.

Matrices:

- `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/NUTRITION-COVERAGE-MATRIX.md`
- `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/ACTIVITY-COVERAGE-MATRIX.md`

## Review artifacts

Start here:

- `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/README.md`
- `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/comparison-board.html`
- `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/screens/review-index.png`

Coverage boards:

- dark: `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/screens/nutrition-activity-coverage-board.png`
- mineral light: `agent-handoffs/artifacts/nutrition-activity-evidence-style-translation-20261004/screens/nutrition-activity-coverage-board-light.png`

Full-resolution screens use `evidence-n1.png` through `evidence-n8.png` and `evidence-a1.png` through `evidence-a7.png`; mineral-light variants add `-light`.

## Validation

Automated browser validation passed:

- 15/15 expected screens in each appearance;
- 0 missing, extra, or duplicate IDs;
- 0 board/card/phone overflow;
- 0 dark/light product-text mismatches;
- exact Activity metric order;
- exact totals-only and partial Apple Health copy;
- source labels scoped and non-additive;
- no invented Activity Reporting title/chart;
- no Cooldown/Cardio misclassification;
- no editable treatment on Evidence rows;
- overall `validation.json` status: `pass: true`.

## Accessibility and feasibility

The design specifies Dynamic Type-safe wrapping, 44pt navigation/disclosure targets, accurate VoiceOver traits/order, explicit source/provisional language, accessible chart summaries, tabular numeric values, semantic color paired with text, and dark/mineral-light contrast checks.

Estimated implementation complexity is medium and primarily view-local. Highest risks are accidental duplicate Nutrition totals, treating totals-only days as invalid, adding unsupported Activity routes, or visually summing workout/non-workout attribution into active energy.

## Shipping isolation

Confirmed: no shipping Native or Server code changed; no evidence contract, aggregation rule, HealthKit behavior, navigation, canonical workout classification, strategic eligibility, or historical record changed; no build/TestFlight work occurred.

## Next action / stop reason

Stop for Founder review of the concise comparison page and focused dark/mineral-light surfaces. Shipping implementation remains unauthorized and not started.
