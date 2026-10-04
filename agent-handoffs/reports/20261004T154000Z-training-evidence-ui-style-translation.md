# Training Evidence UI style translation — complete

Date: 2026-10-04 15:40 UTC
Status: **accepted and locked with the all-10 Training Areas clarification; implementation not started**

## Authority

- Prompt authority: `2bae36cfa5f3364880abf8966800c658bd30aafc`
- Exact Native authority audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026`
- Native build: 85
- Utility design locks carried forward: Watch locked; Live Activity / Dynamic Island locked; Logger locked.

## Outcome

The complete current Training Evidence navigation hierarchy was audited before design. Sixteen direct dark/mineral-light product templates now cover every materially distinct route and state, with every near-identical state mapped explicitly in the complete matrix.

The translation is intentionally conservative:

- current information architecture, order, data density, routes and drill-down depth are unchanged;
- set/session history is visibly read-only and carries no Logger input or Done controls;
- Strength, Walking and Cardio retain distinct text + semantic treatment;
- Cooldown is specified as historical `other`, never styled or counted as Cardio;
- HealthKit provenance and confirmed/candidate reconciliation language remain explicit;
- Session Volume and Reps-at-Load retain normalized current-record semantics and canonical exercise identity;
- no chart was invented. Build 85 Training Evidence currently renders no chart; four reporting routes intentionally remain the shared Foundation placeholder.

Founder lock clarification: the Training Areas section renders all 10 live-app areas in exact order and count — Chest 7, Back 4, Shoulders 8, Biceps 3, Triceps 3, Core 3, Quads 18, Hamstrings 4, Glutes 3, Calves 1. The focused dark/mineral-light proof is `screens/training-areas-all-10.png` and `screens/training-areas-all-10-light.png`. No area is bucketed, merged, prioritized, paginated, or hidden.

## Complete current hierarchy audited

Evidence Hub → Training landing → Latest Day / Training Areas / Reporting / Recent History / Protocol / Related Goals.

Descendants:

- Training Day → ordered Session rows;
- Session → structured Strength, telemetry, HealthKit attachment, cardio/walking fallback, media, correction availability;
- Training Library → Area → Exercise Detail;
- Exercise Detail → Current Benchmark → optional inline Performance Records → Last Session → inline-expand Recent History;
- Reporting → Resistance, History, and shared Foundation destinations for Cardio / Volume / Frequency / Consistency;
- sheets for all history, resistance status, PRs, needs-attention and categories.

The exact tree and contract quirks are recorded in:

- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/NAVIGATION-TREE.md`
- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/SOURCE-AUDIT.md`

## Coverage matrix

The required matrix is complete at:

`agent-handoffs/artifacts/training-evidence-style-translation-20261004/COVERAGE-MATRIX.md`

Columns are exactly:

`Screen/state | Current source component | Data shown | Navigation in/out | Proposed styling template | Mocked? | Covered?`

Result:

- direct product templates: 16;
- dark renders: 16;
- mineral-light renders: 16;
- near-identical states explicitly mapped: all;
- uncovered states: 0.

## Review artifacts

Start here:

- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/README.md`
- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/comparison-board.html`
- `agent-handoffs/artifacts/training-evidence-style-translation-20261004/screens/review-index.png`

Coverage boards:

- dark: `agent-handoffs/artifacts/training-evidence-style-translation-20261004/screens/training-evidence-coverage-board.png`
- mineral light: `agent-handoffs/artifacts/training-evidence-style-translation-20261004/screens/training-evidence-coverage-board-light.png`

Full-resolution screens use `training-evidence-t1.png` through `training-evidence-t16.png` in the `screens/` directory; light variants add `-light`.

Supporting review documents:

- source audit: `SOURCE-AUDIT.md`
- navigation tree: `NAVIGATION-TREE.md`
- coverage matrix: `COVERAGE-MATRIX.md`
- token/component mapping: `TOKEN-COMPONENT-MAPPING.md`
- feasibility/accessibility/regression plan: `IMPLEMENTATION-NOTES.md`
- automated validation: `validation.json`

## Dark/mineral-light parity

Automated browser validation passed:

- 16/16 expected screens present in dark;
- 16/16 expected screens present in mineral light;
- 0 missing or extra screens;
- 0 horizontal board/phone overflows;
- 0 dark/light product-text mismatches;
- identical hierarchy, content, values, navigation cues and geometry across appearances.

Only appearance tokens differ.

## Semantic validation

- Exact fixture data is used for Training Day, Strength, Walking, Run, structured set history, Session Volume and Reps-at-Load.
- No performance event is inferred. Green record emphasis appears only on validated current records/improvements.
- Cooldown has no fabricated fixture row. Its documented template is neutral/recovery, remains `Cooldown`, maps to `other`, and is excluded from `hasCardio` and Cardio totals.
- Run retains Cardio identity; Stair Stepper remains canonical Cardio under the same template.
- HealthKit source is scoped to its session; candidate and confirmed relationship copy remain distinct.
- Timed, bodyweight, weighted/external-load, variant and superset semantics are unchanged.
- Exercise History disclosures remain inline; no new destination was created for records or historical occurrences.
- T9/T10 are focused scroll positions of inline Exercise Detail records, not new record pages.

## Source findings documented without shipping repair

- `sourceEvidence` exists on Training landing/session projections but is not consistently rendered by the current views.
- goal/phase `attributedScope` exists on day/session models but is not currently rendered.
- session-level `performanceRecords` is decoded but records are presented on Exercise Detail.
- Build 85 production source includes a duplicated `id:` argument in the captured Training Reporting mapping.

The harness documents these facts and does not alter the Server contract or shipping data.

## Accessibility

The translation specifies Dynamic Type-safe wrapping, 44pt navigation/disclosure targets, correct VoiceOver order and traits, column-header semantics for read-only set tables, text labels alongside semantic color, explicit HealthKit relationship language, strong dark/light contrast, and no tiny type to preserve density.

## Implementation feasibility

Estimated complexity: **medium**.

The work is largely local styling and reusable read-only primitives. Main risks are semantic rather than visual: Cooldown/Cardio classification, HealthKit confirmation language, duplicate summary rendering, bodyweight/load formatting, record normalization, and accidentally making Exercise History navigate or look editable.

Recommended implementation validation is documented in `IMPLEMENTATION-NOTES.md`, including dark/light snapshots, Dynamic Type, route tests, HealthKit states, set-semantic fixtures, record normalization and Cooldown non-Cardio regression coverage.

## Shipping isolation

Confirmed:

- no shipping Native UI changed;
- no Server code or behavior changed;
- no evidence contract changed;
- no HealthKit behavior or provenance changed;
- no canonical exercise identity or Performance Record semantics changed;
- no historical data changed;
- no global theme implementation occurred;
- no build number changed;
- no TestFlight was created.

Only disposable design/review artifacts, documentation, and backlog status were added or updated.
