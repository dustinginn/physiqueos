# Implementation feasibility, accessibility, and preserved behavior

Status: proposal only. Implementation has not started.

## Behavior explicitly preserved

- Phone remains sole structured-workout authority.
- Watch remains owner of the indoor traditional-strength HealthKit workout lifecycle.
- ActivityKit remains a revisioned projection, not a third authority.
- Logger workflow remains Entry → Areas → Picker → Active → Review → Final Confirmation → Complete.
- Watch gesture model remains swipe right for controls and Crown for Workout → Metrics → Daily Totals.
- One structured mutation in flight, revision checks, same-mutation retry, no optimistic advancement.
- Final set never auto-finishes.
- Finish and Cancel remain separate and explicitly confirmed.
- Finish retains PhysiqueOS and Apple Health legs and same-operation recovery.
- Logger set entry remains inline with the numeric keyboard; no Add/Edit Set sheet was introduced.
- Variant, superset, substitute, reorder, and remove remain existing menu actions.
- Evidence remains optional supporting input and does not become workout authority.
- Ambiguous Health workout matching remains a later Pending Evidence Review action.
- Trusted exact Watch correlation continues to bypass generic matching and use normal completion.
- Confetti remains one-time, visibility-gated, and suppressed by Reduce Motion.
- No phone timer, pause/resume, rest screen, Watch-active banner, notes, favorites, workout-type picker, unchecked-set warning, duplicate modal, or Live Activity Finish/Cancel was invented.

## Conservative UX refinements represented

These are visual-system refinements, not workflow changes:

- Make current vs previous/next hierarchy sharper on Watch without changing data.
- Name the unavailable authority lane instead of using a generic disconnected state.
- Show PhysiqueOS and Apple Health as separate finish legs.
- Keep destructive actions text-labeled and visually separated from primary execution.
- Normalize Logger field focus, set completion, menu hierarchy, and sticky Finish prominence.
- Use one state treatment for saving/long waits: reason, safe-local assurance, and same-operation retry.
- Translate the same geometry into mineral-light tokens for direct review parity.

Potential future behavior changes are documented only, not mocked as shipping behavior:

- Render timed duration on Watch once the mapper/view contract is intentionally extended.
- Distinguish explicit pause from stale Live Activity only if the content contract gains a distinct semantic state.
- Consider a Logger Watch-status strip or paused-edit explanation only after authority/rejection copy is specified.
- Consider exposing Health Save retry from the committed Watch summary if finish-coordinator semantics allow it.

## Apple Watch feasibility

### Reusable current components

- `ios/PhysiqueOSWatch/WatchWorkoutViews.swift` state switch, pager, execution, controls, confirmations, finish and summary branches
- `WatchWorkoutStore.swift` observable state and action routing
- `WatchWorkoutHealthController.swift` HealthKit lifecycle
- `WatchWorkoutProjectionMapper.swift`, `WatchWorkoutCommandRouter.swift`, `WatchWorkoutConnectivityBridge.swift`
- `WatchWorkoutFinishCoordinator.swift`
- `WatchWorkoutContracts.swift`

### New visual primitives

- Watch-scoped token environment
- `WatchContextRow`
- `WatchMetricCell`
- `WatchPrimaryAction` / `WatchQuietAction` / `WatchDestructiveAction`
- `WatchAuthorityStatus`
- `WatchSaveLegStatus`
- adaptive `WatchSummaryMetricGrid`

### Likely files affected

- Primarily `ios/PhysiqueOSWatch/WatchWorkoutViews.swift`
- Token/font plumbing in Watch target resources/shared UI
- Preview fixtures and snapshot/UI tests
- No store, router, transport, Health controller, or finish-coordinator change should be needed for pure translation

### Complexity and risk

- Complexity: medium. The visual code is centralized, but many state branches share hard-coded values.
- Regression risk: medium-high because small Watch geometry changes can clip across case sizes, Dynamic Type, and Always-On.
- Platform constraints: OLED/Always-On luminance, limited vertical space, system Health authorization, watchOS font scaling, gesture/page ownership.
- Hard-coded blockers: palette literals, small fixed fonts, 32–34 pt actions, and state-specific layouts that do not share semantic primitives.

### Required validation

- 41/45/49 mm case coverage as supported by the target
- active, paused, authority-warning, finishing, summary, and orphan states
- Crown paging and physical-left controls page
- Always-On snapshots and 15-second timer behavior
- VoiceOver action names and combined metric values
- full Finish/Cancel confirmation tests and Health start/save recovery
- timed-set source gap stays unchanged until explicitly approved

## Live Activity / Dynamic Island feasibility

### Reusable current components

- `ios/PhysiqueOSShared/WorkoutActivityAttributes.swift`
- `ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift`
- `ios/PhysiqueOSLiveActivity/WorkoutLiveActivityWidget.swift`
- `ios/PhysiqueOSShared/CompleteWorkoutSetIntent.swift`
- `WorkoutLiveActivityClient.swift`, `WorkoutLiveActivityCoordinator.swift`, `WorkoutLiveActivityBridge.swift`

### New visual primitives

- ActivityKit-scoped semantic colors
- `LiveWorkoutRow`
- `LiveRestClock`
- `LiveLifecycleStatus`
- `LivePrivacyPlaceholder`
- region-specific action styling that retains the existing intent

### Likely files affected

- `WorkoutLiveActivityViews.swift`
- `WorkoutLiveActivityWidget.swift`
- preview/test fixtures and view tests
- No attributes, coordinator, bridge, client, or App Intent contract change is required for the proposed translation

### Complexity and risk

- Complexity: low-medium. Content is intentionally small; system region constraints dominate.
- Regression risk: medium because Lock Screen and expanded/compact/minimal regions must remain valid across OS versions and localization.
- Platform constraints: Dynamic Island remains system black; privacy redaction; system timer/date behavior; short update budget; system font/contrast expectations.
- Hard-coded blockers: current colors are view literals and not shared with the selected app visual language.

### Required validation

- every ActivityFamily region and privacy redaction
- countdown, stopwatch, no-rest, current-only, and two-row data
- explicit pause vs stale remains deliberately conflated until the contract changes
- Complete Set retains target revision and mutation identifier
- no Finish, Cancel, evidence, HealthKit, or PR content appears
- VoiceOver labels summarize progress, current set, next set, rest, and action without duplicate reading

## Training Logger feasibility

### Reusable current components

- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift`
- `TrainingLoggerViewModel.swift`
- `TrainingRestPreferenceMenu.swift`
- `TrainingLoggerCardView.swift`
- `PendingEvidenceReviewsCardView.swift`
- `EvidenceReviewDetailView.swift`
- `TrainingLoggerDraftStore.swift`, `TrainingLoggerAPI.swift`, Logger/evidence read models

### New visual primitives

- scoped `LoggerUtilityTheme` with dark/mineral appearances
- `LoggerStepHeader`
- `LoggerExerciseCard`
- `LoggerSetRow` and `LoggerNumericFieldStyle`
- `LoggerRelationshipMenuLabel`
- `LoggerEvidenceStateRow`
- `LoggerFinishStatePanel`
- `LoggerSuccessRecordsPanel`

### Likely files affected

- `TrainingLoggerView.swift` for the majority of translation
- optional extracted presentation-only Logger components/styles
- `TrainingLoggerCardView.swift` for entry continuity
- `PendingEvidenceReviewsCardView.swift` and the workout-match branch in `EvidenceReviewDetailView.swift`
- Logger previews/tests and accessibility identifiers
- No view-model, API, draft store, evidence model, or reconciliation semantic change should be needed

### Complexity and risk

- Complexity: high. One large view owns the entire high-frequency flow and many inline states.
- Regression risk: high around keyboard avoidance, focus order, list identity, sticky footer, menu actions, and destructive paths.
- Platform constraints: Dynamic Type inside dense tables, hardware/software keyboard transitions, sheet/menu placement, compact-width reachability.
- Hard-coded blockers: scoped dark palette, repeated padding/radius/color literals, fixed column grids, and control sizes below 44 pt.

### Required validation

- live and past-workout entry, saved draft, areas, both picker modes, collision candidates
- ordinary/timed/bodyweight/weighted-bodyweight and superset cards
- keyboard Previous/Next/Done and content not hidden behind keyboard/footer
- all relationship-menu commands and immediate removals
- Cancel confirmation and Save & Leave distinction
- Review evidence states, final semantic Finish, long-save retry, post-Finish discard
- normal completion, records, Reduce Motion, Return to Log
- ambiguous match and trusted exact-correlation bypass
- exact same test pass in dark and mineral-light

## Accessibility requirements

### Apple Watch

- Target 44 × 44 pt actions wherever layout permits; never shrink Finish/Cancel/Complete below platform guidance.
- Combine label/value/unit into one VoiceOver element for each metric.
- Announce workout progress, current exercise, set index, current value, rest mode/time, and action state in a stable order.
- Support accessibility text sizes by reflowing or paging, not clipping.
- Keep current/previous/next and success/caution/destructive states understandable without color.
- In Always-On, preserve essential values and avoid animation dependence.
- Respect Reduce Motion for any new progress transition; no celebratory motion is proposed.

### Live Activity

- Use short VoiceOver summaries per region rather than reading every decorative label.
- Preserve 44 pt action targeting for Complete Set where the platform allows interaction.
- Exercise/value content and timers must meet contrast in both appearances.
- Privacy-redacted content must have a meaningful generic accessibility label.
- Never require animation to communicate pending, finishing, or success.

### Logger

- Minimum 44 pt interactive targets, especially set deletion, completion, row menus, and evidence removal.
- Dynamic Type must allow exercise cards and review summaries to grow vertically; fixed horizontal set grids need an accessible fallback at large sizes.
- Numeric fields expose exercise, set number, unit, current value, and completion state.
- Keyboard focus order follows visible set order and Previous/Next behavior.
- Sticky Finish must not cover the focused field or keyboard toolbar.
- Destructive confirmations name the object and consequence; Cancel remains distinct from Save & Leave.
- Confetti is hidden from accessibility and suppressed with Reduce Motion.
- Dark/light selection must not alter reading order or semantic state.

## Review decision points

The Founder can approve independently:

1. overall utility token direction;
2. Watch execution/control/finish density;
3. Live Activity teal action/current-row treatment;
4. Logger set-table density and amber Finish action;
5. mineral-light parity for Logger;
6. whether mineral-light Watch and Lock Screen explorations remain reference-only or advance to platform feasibility review.

None of these directions is marked locked in this package.
