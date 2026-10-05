# Redesign Implementation Batch 3 — source-to-design map

Authority: `df2d7d504c371e4745453be22e7a37a500f3a239`  
Implementation base: `49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7`  
Branch: `codex/redesign-batch3-evidence-20261005`

## Checkpoint A — Evidence Hub and Timeline

- Evidence Hub root: loading, loaded, Recently Used, All Evidence, failure.
- Hub navigation: Training, Nutrition, Weight, Photos, DEXA, Activity, Energy, Recovery, Timeline.
- Timeline: loading, populated newest-first bounded page, empty, failure, bounded-count footer.
- Canonical owners: `EvidenceAPI`, `EvidenceHubReadModel`, `EvidenceHubUsageService`, `TimelineAPI`, `TimelineReadModel`.
- Locked visual owners: `EvidenceView`, `EvidenceHeaderView`, `EvidenceStreamRowView`, `TimelineView`.
- Contract/design reconciliation: production still projects the non-functional `health-metrics` placeholder and does not project Timeline as a Hub stream. The Founder-locked Hub removes placeholders and places the already-canonical Timeline route last. Native filters `health-metrics` and adds a presentation-only Timeline doorway; Server data and Timeline chronology are unchanged.

## Checkpoint B — Training and Activity/Cardio

- Training history, day, session, exercise detail, 10-area library, six reporting views.
- Strength sets, supersets, variants, timed/bodyweight/weighted-bodyweight sets, notes and Apple Health cardio.
- Activity history and activity day, linked training context, 3-row recent preview, full history.
- Canonical owners: `TrainingAPI`, Training read models/view models, `ActivityAPI`, Activity read models/view models, HealthKit provenance projected by Server.
- Locked visual owners: `Presentation/Training/**`, `ActivityHistoryView`, `ActivityDayView`.

## Checkpoint C — Nutrition and Weight

- Nutrition history, latest/historical day, calories/macros/meals reporting, three-row recent preview and full history.
- Weight current summary, chart/history, inline Show All/Close disclosure, loading/empty/error.
- Canonical owners: `NutritionAPI`, `NutritionReadModel`, `WeightAPI`, `WeightReadModel`.
- Locked visual owners: `Nutrition*View`, `NutritionReporting*`, `WeightHistoryView`.

## Checkpoint D — Photos and DEXA

- Photos history, session detail, pose grid, matched previous/current comparison, no-photo/one-photo/matched states, full-screen single and paired viewers.
- DEXA history/detail, all canonical units, ten-section ordering, 17 truthful graphs, PDF, correction/dismiss affordances supplied by the contract.
- Canonical owners: `PhotosAPI`, photo read models, `DEXAAPI`, DEXA read models.
- Locked visual owners: `PhotosHistoryView`, `PhotoSetDetailView`, `DEXAHistoryView`, `DEXAChartViews`.
- Real-photo safety: real Founder photo paths are validated locally; public artifacts use the established non-private fixture/redaction path.

## Checkpoint E — intake and generic review

- Add Evidence picker, supported types, asset/text/manual inputs, processing, generic review, accepted-to-processing, partially committed, commit failure, retry, dismiss and correction controls where canonical.
- Canonical owners: `ProductionEvidenceIntakePipeline`, `ProductionEvidenceUploadView`, `EvidenceReviewAPI`, `EvidenceReviewDetailReadModel`, `EvidenceReviewDetailView`.
- Explicit exclusion: the `workoutReconciliation` / Workout Match branch remains the Batch 2 implementation and is not restyled here.

## Shared design components

- `EvidenceDesignSystem.swift`: section eyebrow/title treatment, page hero, flat navigation/record rows, semantic badges, dividers, field labels, loading/error/empty states.
- Existing global `PhysiqueOSTheme` and `AppAppearanceStore` remain the only appearance authority. Batch 3 adds no local theme.
- Existing chart/read-model components remain data authorities; styling changes only their presentation.

## Batch 2 overlap and integration boundary

Claude Batch 2 currently changes these files that Batch 3 may also need:

- `Presentation/Evidence/EvidenceReviewDetailView.swift` — true semantic overlap. Batch 3 must preserve the Batch 2 Workout Match branch and integrate only generic-review styling around it.
- `SharedUI/PhysiqueOSTheme.swift` — Batch 3 consumes it but does not modify it.
- `Contracts/LogReadModel.swift`, `Networking/EvidenceReviewAPI.swift`, `Networking/ProductionDailyDriverAPI.swift`, Log and Training Logger files — Batch 3 does not modify these.
- `FounderServerAPITests.swift` and Batch 2 UI tests — Batch 3 avoids editing them; Batch 3 adds isolated tests where needed.

At final integration, merge the approved Batch 2 authority first, then resolve `EvidenceReviewDetailView.swift` by retaining Batch 2's complete Workout Match case and applying Batch 3's generic visual shell to all other cases. No wholesale file selection is safe for that file.

## Global invariants

- Server ordering, provenance, units, graph data, review versions, accepted-to-processing and retry semantics remain unchanged.
- No strategic interpretation is added to Evidence.
- Full-row controls remain at least 44 pt and expose stable accessibility identities.
- Dark and Mineral Light are driven exclusively by the accepted global appearance infrastructure.
