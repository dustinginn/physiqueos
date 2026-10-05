# PhysiqueOS Redesign Implementation Batch 3 — Evidence family

- Task authority: `df2d7d504c371e4745453be22e7a37a500f3a239`
- Implementation base: `49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7`
- Branch: `codex/redesign-batch3-evidence-20261005`
- Batch 3 implementation authority before this report commit: `d842a76bdb8dad023da4add7104688747d9c1872`
- Apple-VALID product base: Build 87 at `f66c7fc690b1b61094e620791ee2d4a40caf3799`
- Status: **implementation complete through Checkpoints A–E; separate review authority; not integrated with Batch 2; no TestFlight upload**

## Outcome

The complete locked Evidence family is implemented in Dark and Mineral Light on the accepted Home-corrected Build 87 base. The implementation preserves the current Evidence contracts and behavior while translating the Hub, Timeline, all canonical domain verticals, intake and generic review into the locked PhysiqueOS visual system.

No Server source, schema, production data, product version or build number changed. No archive or TestFlight upload was performed. Claude's Batch 2 branch was read only for the final overlap audit; it was not merged, cherry-picked or modified.

## Checkpoint authorities and review packages

| Checkpoint | Implementation SHA | Scope | Review package |
|---|---|---|---|
| A | `e48e7757` | Evidence Hub, stream doorway order, Recent Usage, Timeline, loading/empty/error | `agent-handoffs/artifacts/redesign-batch3-checkpoint-a-20261005/checkpoint-a-mobile-review-board.png` |
| B | `e7e3774c` | Training root/day/session/library/reporting and Activity/Cardio root/day | `agent-handoffs/artifacts/redesign-batch3-checkpoint-b-20261005/checkpoint-b-mobile-review-board.png` |
| C | `e56c02e0` | Nutrition root/day/reporting and Weight | `agent-handoffs/artifacts/redesign-batch3-checkpoint-c-20261005/checkpoint-c-mobile-review-board.png` |
| D | `bf4551c4` | Progress Photos root/detail/comparison/viewer handoff and DEXA | `agent-handoffs/artifacts/redesign-batch3-checkpoint-d-20261005/checkpoint-d-mobile-review-board.png` |
| E | `d842a76b` | General intake, DEXA intake, generic Evidence Review and correction/lifecycle states | `agent-handoffs/artifacts/redesign-batch3-checkpoint-e-20261005/checkpoint-e-mobile-review-board.png` |

Every package contains the exact locked design references, unedited real iPhone 17 Pro simulator captures in both appearances, a side-by-side mobile board, parity notes and focused validation. The source-to-design inventory is in `agent-handoffs/artifacts/redesign-batch3-evidence-20261005/SOURCE-DESIGN-MAP.md`.

## Complete surface and state inventory

### Hub and chronology

- Evidence Hub loaded, loading and failure states.
- Recently Used and the locked functional stream order: Training, Nutrition, Weight, Photos, DEXA, Activity, Energy, Recovery, Timeline.
- Timeline loaded, loading, empty, failure and bounded-count footer states with newest-first chronology.
- The non-functional `health-metrics` Server placeholder is presentation-filtered; no payload or contract changed.

### Training and Activity/Cardio

- Training history, day, structured session, exercise detail, all ten training areas and all six existing reporting destinations.
- Strength sets, supersets, variants, timed/bodyweight/weighted-bodyweight sets, notes and Apple Health cardio/provenance.
- Activity history and day detail, linked-training context, recent preview/full history and canonical calorie/goal units.

### Nutrition and Weight

- Nutrition history, latest and historical day, meal/source detail, calories/macros reporting, metric switching, phase/strategy filtering and full history.
- Weight current summary, unit-bearing chart, scope filtering, weekly averages, history and inline Show All/Close disclosure.

### Progress Photos and DEXA

- Progress Photos history, session detail, canonical pose order, Previous/Current matching, interpretation, capture conditions, source disclosure and the existing single/paired inspection handoff.
- No Founder photo bytes are present in the GH package; public captures use the established safe fixture path.
- DEXA current/prior scan treatment, exact units, all core/supplemental/regional charts, interactive scrubbing, history, PDF and Apple Health writeback state.

### Intake and generic review

- Add Evidence domain chooser in the exact current production order.
- Automatic mixed grouping and local ambiguous-type choice.
- Direct-save Nutrition/Activity manual flows without an invented review step.
- Existing specialized handoffs for Training, Weight, Progress Photos and DEXA.
- One-PDF DEXA intake, staged Progress Photos transport/resume and normal processing/accepted/failure states.
- Generic review included/excluded state, pending/processing/failed/partially committed/confirmed/dismissed outcomes, retry eligibility, version/idempotency guards and DEXA full-replacement correction.
- Deterministic visual review routes and payloads are `#if DEBUG` only and do not exist in Release.

## Canonical behavior proof

- No Evidence authority, provenance, units, graph data, chronology, aggregation, navigation destination or conditional action was changed.
- Accepted-to-processing and processing-queue semantics remain production owned.
- Evidence Review version guards, retry/dismiss actions and full DEXA replacement remain production owned.
- Progress Photo pose/date mapping and staged upload behavior remain production owned.
- Training Evidence remains distinct from Training Logger, and no strategic interpretation moved into Evidence.
- Stable navigation/test identities and full-row tap targets were retained; new visual-only launch seams are DEBUG gated.

## Pixel-parity result

All checkpoints were rendered from the real shipping SwiftUI views on iPhone 17 Pro simulator `A8157897-95ED-4480-9150-6136652A6519` under Dark and Mineral Light. Each board compares the exact accepted reference with its simulator capture.

Matched elements include the locked semantic canvas, ink hierarchy, selective colored fields, flat rows, dividers, corner treatments, badges, chart geometry, scope controls, Evidence identity and Dark/Mineral translation. Remaining differences are limited to:

- real iOS 26 Liquid Glass navigation/tab chrome, which is absent from frameless design renders;
- the real iPhone 17 Pro viewport/safe-area geometry versus the 402 × 874 design harness;
- truthful dynamic fixture text/order where the accepted render intentionally abstracted data;
- safe synthetic photo silhouettes in public artifacts instead of private Founder media.

## Final validation

### Unit and contract gate

`xcodebuild test` passed on iPhone 17 Pro / iOS 26.5 for 23 selected suites spanning:

- Evidence Hub/read models and chronology;
- generic review date/content-type behavior and the complete relevant `FounderServerAPITests` contract set;
- Training and session presentation;
- Activity/Cardio;
- Nutrition and reporting calculations;
- Weight;
- Photos, pose mapping, processing and inspection viewer;
- DEXA and HealthKit writeback;
- staged photo intake and generic logging intake;
- Shared UI/appearance and app-tab routing;
- Workout reconciliation diagnostics.

Result: **766 passed, 0 failed, 0 skipped**. Result bundle: `/tmp/physiqueos-batch3-dd/Logs/Test/Test-PhysiqueOS-2026.10.05_07-11-44--0700.xcresult`.

### Real-app UI journey

`TrainingAcceptanceUITests/testCorrectedEvidenceJourneys` passed on the same simulator, exercising Weight, DEXA, Progress Photos/detail and Energy Evidence navigation through the real app shell.

Result: **1 passed, 0 failed**. Result bundle: `/tmp/physiqueos-batch3-dd/Logs/Test/Test-PhysiqueOS-2026.10.05_07-12-23--0700.xcresult`.

### Release compile

The `PhysiqueOS` Release scheme compiled successfully with `CODE_SIGNING_ALLOWED=NO` against the iPhone simulator SDK. Verified products:

- `PhysiqueOS.app`
- embedded `PhysiqueOSWatch.app`
- embedded `PhysiqueOSLiveActivity.appex`
- the WidgetKit extension contains both `WorkoutLiveActivityWidget` and `HomeLoggedTodayWidget`

The compile emitted existing Swift concurrency warnings in `PhysiqueOSApp.swift` and `BackgroundExecutionAssertion.swift`; no Batch 3 compile error or new release blocker was present.

## Exact Batch 2 integration map

Refreshed concurrent Batch 2 branch:

- Branch: `origin/claude/redesign-batch2-log-logger-20261005`
- Audited head: `7a9a7caaa582b3e9b3926cb0ed19842c773dc6b3`
- Common integration base: `49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7`

There is exactly one source file modified by both authorities:

- `ios/PhysiqueOS/Presentation/Evidence/EvidenceReviewDetailView.swift`

Required integration order:

1. Start from the final Founder-approved Batch 2 authority, provided it still descends from the common base above.
2. Apply Batch 3 Checkpoints A–D in order: `e48e7757`, `e7e3774c`, `e56c02e0`, `bf4551c4`.
3. Apply Checkpoint E `d842a76b` with a manual resolution of `EvidenceReviewDetailView.swift`.
4. In that resolution, retain Batch 2's complete specialized `review.workoutReconciliation != nil` path: conditional canvas, `workoutMatchContent`, locked candidate cards, actions, resolved state and Logger typography/components.
5. Apply Batch 3's `EvidenceWorkflowHero`, redesign canvas/surfaces and generic action treatment only to reviews where `workoutReconciliation == nil`.
6. Retain the Batch 3 DEBUG-only generic review fixtures and routes; they must remain absent from Release.
7. Re-run the 766-test gate, the Evidence UI journey and Release compile after integration.

Do not resolve the shared file by choosing either side wholesale. Every other Batch 3 source change is disjoint from the refreshed Batch 2 source set. Batch 3 deliberately does not modify Batch 2's `EvidenceReviewAPI`, Log, Training Logger, theme or tests.

## Boundaries and next step

- No Server change or deployment.
- No private Founder media committed.
- No build-number or marketing-version change.
- No archive, TestFlight upload or production mutation.
- No unresolved product decision was invented or deferred.

Recommended next family after Founder review and deliberate Batch 2/3 integration: implement the already-locked recurring Briefing family, using the same checkpointed simulator-parity workflow rather than reopening any locked Home, Log, Goals, You/Settings or Evidence design.
