# Energy, Weight + Recovery Evidence UI style translation — complete

Date: 2026-10-04 17:31 UTC  
Status: **complete source-audited design translation; ready for Founder review; implementation not started**

## Authority

- Prompt authority: `fbd6dd35e4e0dbabe5834d309170dcd2e724398a`
- Exact Native source audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Work branch: `codex/energy-weight-recovery-evidence-design`
- Artifact commit: `1f8ba1b9abd0db1826ac911bffcdbd7536d332c8`
- Artifact root: `agent-handoffs/artifacts/energy-weight-recovery-evidence-style-translation-20261004/`

## Locked carry-forward

- Training Evidence: **locked**, with all 10 canonical Training Areas.
- Nutrition Evidence: **locked**, with three-row Recent Nutrition History + Show All, functional Calories/Macros/Meals, canonical non-duplicate aggregation and no future-placeholder UI.
- Activity Evidence: **locked**, with three-row Recent Activity History + Show All, current informational metrics/Linked Training Context, no invented Reporting or future-placeholder UI, and Cooldown remaining historical non-Cardio.

These designs were not reopened.

## Outcome

Energy, Weight and Recovery were audited as three independent hierarchies before styling. Ten direct templates now cover every materially distinct current route and state family, with all remaining near-identical states explicitly mapped in three zero-gap matrices. Every key template exists in dark and mineral light with exact text/semantic parity.

Energy remains one page with two existing chart families, separate Weekly and Daily Show All sheets, and Recent Daily Energy discoverable at the root bottom. Intake, active calories, estimated expenditure and signed balance remain distinct. All five completeness states are covered. Build 85 has no Energy day-detail route, so none was invented; available day links continue to point only to current Nutrition and Activity roots.

Weight remains one page with literal Goal-dependent summary behavior, the existing tight-domain trend, exact purple dashed DEXA markers, optional canonical 3-day/7-day server averages, Weekly Averages and Weight History disclosures. Build Lean Mass retains Highest; Visible Abs retains Last Change and Lowest. History stays read-only and expands inline. No detail/history route, streak, Related Goals or provider roadmap UI was added.

Recovery preserves the full root → Trends / All Nights / Night Detail hierarchy. The translation covers nightly and weekly trend modes, timeline, stages, continuity, time in bed, additional sleep, open-window finality, uncertain historical clock time, pending-correction/absent detail, pagination and counted/corroborating source provenance. Oura-via-Apple-Health remains quiet but explicit, and one counted source per night prevents duplicate counting. Recovery remains quarantined Evidence: no Recovery Score, coaching, causality, strategic use or Confidence activation.

## Concise review artifacts

Start here:

- `agent-handoffs/artifacts/energy-weight-recovery-evidence-style-translation-20261004/screens/review-index.png`
- dark full board: `screens/energy-weight-recovery-coverage-board.png`
- mineral-light full board: `screens/energy-weight-recovery-coverage-board-light.png`
- artifact guide: `README.md`

Individual renders are `screens/evidence-e1.png` through `screens/evidence-r6.png`; mineral-light counterparts add `-light`.

Audit and implementation handoff:

- `SOURCE-AUDIT.md`
- `NAVIGATION-TREES.md`
- `ENERGY-COVERAGE-MATRIX.md`
- `WEIGHT-COVERAGE-MATRIX.md`
- `RECOVERY-COVERAGE-MATRIX.md`
- `TOKEN-COMPONENT-MAPPING.md`
- `IMPLEMENTATION-NOTES.md`
- `PARITY-SEMANTIC-VALIDATION.md`
- `validation.json`

## Coverage

| Family | Direct templates | Material coverage |
|---|---:|---|
| Energy | 2 | root, two charts, both history sheets, root history preview, five completeness states, route/absence mapping |
| Weight | 2 | one-page root, all scope summary branches, chart/DEXA, rolling/weekly averages, inline history, sparse/pending/empty/async |
| Recovery | 6 | root, Recent/All Nights, nightly/weekly Trends, full night detail, provenance/finality/recalculation, absence/async/scope states |

Each matrix reports uncovered states: **0**.

## Validation

Automated validation passed:

- 10/10 expected templates in both appearances;
- 20 individual phone renders plus two full boards, two previews and one review index (25 PNGs);
- exact dark/light text parity across every template;
- missing, duplicate and extra templates: 0;
- horizontal page/card overflow: 0;
- runtime errors: 0;
- Energy label/semantics/completeness assertions passed;
- Weight scope-label, single-page and DEXA assertions passed;
- Recovery history, timeline/stage/continuity, provenance, no-score and no-roadmap assertions passed.

Accessibility implementation requirements are documented: Dynamic Type reflow, 44pt actions, VoiceOver chart summaries, spoken units, explicit stage names, non-color finality/completeness and read-only row identity.

## Shipping isolation

No shipping Native or Server source changed. No Evidence contract, calculator, Goal/phase scope, chart data/domain, DEXA semantics, HealthKit behavior, sleep reconciliation/provenance, navigation authority, Recovery policy, build number or TestFlight state changed. Only design harness files, rendered PNGs, audit/coverage documentation, validation and durable design-backlog status are on the work branch.

## Next action / stop reason

Founder reviews the concise dark/mineral-light board and, if accepted, locks Energy, Weight and Recovery Evidence for later implementation. All three current hierarchies are covered and validated, so this task stops at review readiness as requested.

