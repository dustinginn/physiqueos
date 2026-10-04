# Build 85 Training Evidence source audit

## Authority

- Prompt: `2bae36cfa5f3364880abf8966800c658bd30aafc`
- Native source: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Audit target: `/private/tmp/physiqueos-build85-native`

## Entry and routing

`EvidenceView` renders the Evidence Hub. The Training stream row uses `EvidenceStreamPresentation` (`dumbbell.fill`, purple) and routes to `.progressStream(streamId: "training")`. `AppDestinationRouterView` resolves that route to `TrainingHistoryView` and owns every descendant route listed in [NAVIGATION-TREE.md](NAVIGATION-TREE.md).

## Current screens and exact displayed contracts

### Training landing — `TrainingHistoryView.swift`

Order is fixed: Evidence Report header → scope selector → Latest Training Day → Training Areas → Reporting → Recent Training History → Current Protocol → Related Goals.

- Scope options are goal/phase-aware and re-fetch data. Default is `All Training` / `Complete history`.
- Latest day has an inline disclosure and separate `View Training Day →` navigation action.
- Training Areas are all 10 canonical muscle groups in this exact production order with exact fixture counts: Chest (7), Back (4), Shoulders (8), Biceps (3), Triceps (3), Core (3), Quads (18), Hamstrings (4), Glutes (3), Calves (1). Founder lock forbids bucketing, merging, prioritizing, paginating, or hiding any of them.
- Reporting has exactly six routes: resistance, cardio, volume, frequency, consistency, history.
- Recent History shows one day and a Show All sheet; rows are newest-first.
- Current Protocol is an inline disclosure.
- Related Goals appears only when non-empty.

States: loading, failed, loaded; Latest Day empty; Recent History empty; disclosures collapsed/expanded; History sheet medium/large.

### Training Day — `TrainingDayView.swift`

Header uses `Training Day`, compact date, and the current summary formatter. All sessions render in source order in one grouped Sessions container. A session row exposes `title` and preformatted `detail`, then routes to `.trainingSession`.

`TrainingDaySummaryDetail` contains body areas, session count, strength session count, exercise count, `hasWalking`, and `hasCardio`. Current summary copy includes body areas, strength count, exercise count, Walking, and Cardio where present.

States: loading, failed, not found (`No training evidence for this day.`), loaded single-session, loaded multi-session.

### Session detail — `TrainingSessionDetailView.swift`

Header: `Workout Detail`, session label, date; legacy `value` is shown only when neither telemetry nor a HealthKit attachment exists.

Conditional sections:

- confirmed/candidate HealthKit attachment: Apple Health source, relationship label, time, duration, active/total calories, average heart rate, distance when each field exists;
- otherwise typed telemetry: time, duration, active calories, average heart rate when each exists;
- structured Exercises using canonical occurrences, sets, freeform execution variants, and superset groups;
- generated Session Details only when exercises, telemetry, and HealthKit attachment are all absent;
- optional authenticated Supporting Screenshots with loading/loaded/failed/unavailable states;
- Founder Production correction card is informational and disabled; Sandbox alone exposes the local-only correction editor.

Set semantics remain exact: duration formats as seconds or `M:SS`; bodyweight is `BW`; weighted/external load keeps units; superset is the only current relationship type.

States: loading, failed, not found, structured strength, structured strength + telemetry, HealthKit confirmed, HealthKit candidate, Apple-only generated summary, media loading/loaded/retry/unavailable, production correction unavailable, sandbox local correction validation/saved draft.

### Exercise detail — `TrainingExerciseDetailView.swift`

Order: Training Library header/breadcrumbs → scope selector → Current Benchmark → optional Performance Records → Last Session → Recent History.

- Benchmark contains Best Set, Last Session date, Current Working Weight, and an optional canonical comparison sentence.
- Performance Records is absent when no valid current records exist; it is not shown as an empty card.
- Last Session includes optional execution variant and superset context, Volume, Best Set, Sets, and the read-only Set/Reps/Load table.
- Recent History contains up to 10 newest-first occurrences. Rows expand inline into the same read-only set table.

States: loading, failed, not found, no benchmark, no records (section absent), no last session, empty history, collapsed history, expanded history, scoped goal/phase results.

### Performance Records — inline in Exercise Detail

Source: `TrainingPerformanceRecordsCalculator.swift`, `TrainingReadModel.swift`.

- Exactly two current types exist: `session_volume_pr` and `reps_at_load_pr`.
- Display is normalized to one current record per type and canonical exercise identity; Reps at Load families are further keyed by load and execution/relationship context.
- Rows preserve title, value, workout date, optional execution variant, previous baseline, improvement detail, and durable relationship context.
- Historical events stay in the underlying event history; the current screen displays normalized current records. No separate Records route exists.

### Reporting — `TrainingReportingView.swift`

- Resistance has real content: four status groups, Recent PRs, Highlights, Needs Attention, Category Rollups, source detail, and three list sheets plus status sheets.
- History has up to 20 day rows and drills into Training Day.
- Cardio, Volume, Frequency, and Consistency are real destinations with the same current Foundation placeholder text.
- Build 85 Training Evidence has **no rendered chart**. The Foundation copy mentions future graphs; inventing one now would violate source parity.

States: loading, failed, not found, resistance populated/section-empty/status-sheet/list-sheet, history populated/empty, shared Foundation placeholder.

### Library — `TrainingLibraryRootView.swift`, `TrainingAreaView.swift`

- Root: header, goal/phase scope, My Library / Browse All toggle, 10-area Browse list.
- Area: header/breadcrumbs, scope, toggle, exercise Browse list; six fixture areas may honestly have no rows in My Library.
- Exercise rows route to Exercise Detail through canonical exercise identity.

States: loading, failed, root loaded, area not found, area populated, area empty, My Library, Browse All.

## Exact fixture evidence used in mockups

- Mixed day: Aug 26, 2026 — Traditional Strength Training (`Chest, Triceps · 4 exercises`) then Walking (`42 min · 2.1 mi · 180 active cal`).
- Cardio: Aug 22, 2026 — Run, `34 min · 3.4 mi · 410 active cal`, source evidence `Apple Health`.
- Structured session: Traditional Strength Training — 6:02 AM–6:54 AM, 52 min, 420 active cal; Bench Press + Cable Fly superset; Overhead Triceps Extension · Static Hold including 30s and 1:15 timed sets; Push-ups bodyweight.
- Session Volume record: Lat Pulldown, `3,340 lb`; previous `3,060 lb`; improved by `280 lb`; Aug 24.
- Reps at Load record: Overhead Triceps Extension · Static Hold, `10 reps at 40 lb`; previous `8 reps`; improved by `2 reps`; Aug 26.

No mock adds a chart or changes fixture values.

## Cooldown and Cardio rule

The current Training model classifies sessions as strength, walking, cardio, or other. No Build 85 fixture contains a Cooldown row and the Native source has no `Cooldown` literal. Therefore the product mockups do not fabricate a Cooldown workout. The implementation rule is explicit:

- canonical `Cooldown` remains labeled Cooldown and uses neutral/recovery styling;
- it maps to `other`, never Cardio;
- it contributes to neither `hasCardio` nor Cardio totals/rollups;
- canonical Cardio such as Run or Stair Stepper keeps Cardio identity.

## Current source discrepancies documented, not repaired in shipping code

1. `TrainingLandingReadModel.sourceEvidence` exists and is described as Data Sources, but `TrainingHistoryView` does not currently render it.
2. `TrainingLandingDay`, `TrainingDayReadModel`, and `TrainingSessionDetailReadModel` carry `attributedScope`, but the current views do not render the attribution.
3. `TrainingSessionDetailReadModel.performanceRecords` is decoded but the current session detail view does not render it; records remain visible on Exercise Detail.
4. Fixture cardio rows carry `sourceEvidence`, but the fallback Session Details branch does not render source. The proposed Cardio template keeps the field close to the session so attribution is unambiguous; implementation must use the existing field without changing the contract.
5. Production `TrainingReportingReadModel` source contains a duplicated `id:` argument in the captured Build 85 file. This design task does not change or reinterpret that shipping source.

These are implementation audit findings, not authorization for data or contract changes.
