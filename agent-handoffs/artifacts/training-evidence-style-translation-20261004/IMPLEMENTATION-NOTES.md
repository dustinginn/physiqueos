# Implementation feasibility, accessibility, and validation

## Feasibility summary

Complexity: **medium**. The hierarchy and read models already exist. Most work is token adoption and extracting a small set of Training Evidence presentation primitives. Highest risk is accidentally changing semantic classification or record normalization while restyling.

## Current files/components

- Entry/router: `EvidenceView.swift`, `EvidenceStreamRowView.swift`, `AppDestinationRouterView.swift`
- Root/history: `TrainingHistoryView.swift`, `TrainingHistoryViewModel.swift`
- Day: `TrainingDayView.swift`, `TrainingDayViewModel.swift`
- Session: `TrainingSessionDetailView.swift`, `TrainingSessionDetailViewModel.swift`
- Exercise/records: `TrainingExerciseDetailView.swift`, `TrainingExerciseDetailViewModel.swift`, `TrainingPerformanceRecordsCalculator.swift`
- Reporting: `TrainingReportingView.swift`, `TrainingReportingViewModel.swift`, `TrainingReportingReadModel.swift`
- Library: `TrainingLibraryRootView.swift`, `TrainingAreaView.swift`, `TrainingLibraryHeaderView.swift`
- Contracts/transport: `TrainingReadModel.swift`, `TrainingAPI.swift`, `ProductionDailyDriverAPI.swift`

## Reuse from the locked utility direction

- dark/mineral page, surface, divider, text, purple, teal, green, amber tokens;
- compact eyebrow/title hierarchy;
- semantic provenance band pattern;
- grouped metrics with tabular numerals;
- border/divider hierarchy and minimal shadow;
- 44pt minimum drill-down targets.

Do **not** reuse Logger input rows or the Done checkbox. Evidence uses a dedicated `EvidenceSetTable`, `EvidenceSessionRow`, and `EvidenceDisclosureRow` with read-only traits.

## Proposed Training Evidence primitives

1. `TrainingEvidenceSessionRow(kind:title:detail:source:)`
2. `TrainingEvidenceMetricGrid`
3. `TrainingEvidenceProvenanceBand`
4. `TrainingEvidenceSetTable`
5. `TrainingEvidenceRecordRow`
6. `TrainingEvidenceAsyncState`
7. `TrainingEvidenceSemanticRail` with `.strength`, `.cardio`, `.walking`, `.cooldown`, `.other`

These are presentation-only wrappers around existing models.

## Hard-coded styling blockers

- Numerous local `.font(.system(...))`, padding, background, radius, and border values across the six view files.
- `CardContainer` is used where the new system calls for open lists, so a global restyle would over-card other product areas.
- Semantic status colors are locally selected in `TrainingReportingView` and benchmark tone mapping.
- Several row implementations repeat nearly identical geometry and need careful extraction without changing navigation.
- Cardio/Walking/Cooldown visual identity requires explicit mapping from `TrainingSessionKind` plus canonical title, not a generic accent.

## Semantic/regression risks

- Treating `.other` or title `Cooldown` as Cardio.
- Recomputing day totals from visual labels instead of retaining server fields.
- Rendering session `detail` alongside structured exercises and duplicating workout content.
- Making a candidate HealthKit relationship look confirmed.
- Re-ranking or combining current records; identity is canonical exercise + record family/context.
- Treating bodyweight zero as external load or weighted bodyweight as plain BW.
- Navigating Exercise History rows instead of expanding them inline.
- Adding charts to current Foundation placeholder routes.

## Accessibility requirements

- Preserve Dynamic Type; allow long exercise names, variants, relationship labels, and large values to wrap.
- Maintain at least 44pt drill-down/disclosure targets without making passive rows announce as buttons.
- VoiceOver order: page identity → scope → sections in current source order; row label → type/source → detail → action hint.
- Announce read-only set tables as column headers and rows; no editable-field traits.
- Announce Strength/Cardio/Walking/Cooldown in text so color is never the only cue.
- HealthKit candidate state must read `Possible match with Workout Logger`; confirmed state reads `Confirmed with Workout Logger`.
- Provide concise chart summaries if charts are added in a later contract. Build 85 renders none.
- Maintain contrast across both palettes; secondary text remains above WCAG AA for normal text in the proposed tokens.
- Respect Reduce Motion for disclosure transitions; no record celebration is proposed.

## Tests and snapshots needed at implementation time

- Snapshot matrix: all 16 representative templates, dark/light, default and large Dynamic Type.
- Day semantic tests: mixed strength/walking/cardio; Cooldown remains other and excluded from Cardio summary/counts.
- Session snapshots: telemetry, confirmed attachment, candidate attachment, fallback, superset, variant, timed, BW, weighted BW, media states.
- Record tests: one current record per normalized type/exercise identity; Session Volume and load-scoped Reps at Load; historical events unchanged.
- Navigation tests: root → day → session; root/library → area → exercise; report → day/exercise; history accordion stays inline.
- Parity tests: identical dark/light text and structural identifiers.
- Accessibility tests: VoiceOver labels/traits, Dynamic Type clipping, 44pt interactive rows.

## Validation result

The disposable harness validates:

- every direct template exists in both themes;
- dark/light screen text is identical;
- board and phone frames have no horizontal overflow;
- every screen contains a product surface;
- no shipping source path is part of the artifact diff;
- no charts, coaching, editing controls, or new navigation destinations are introduced.

See `validation.json` after rendering.
