# Build 85 source audit

## Authority

- Prompt authority: `960f83f4900ae6b12d5192f010054547eae36d9e`
- Shipping Native authority inspected: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85
- Design coordination base: current `origin/main`, which contains the prompt and accepted Home / Log / Briefing visual-language artifacts
- Rule applied: source behavior wins over the prompt’s “likely” state lists

## Apple Watch

Primary source is centralized in `ios/PhysiqueOSWatch/WatchWorkoutViews.swift`, with state supplied by the Watch workout store, Health controller, shared workout contracts, mapper/router/connectivity layer, and finish coordinator.

Material visual templates found:

- `W-A` idle/bootstrap and phone-unavailable variants
- `W-B` orphaned Apple Health workout resolution
- `W-C` Ready for Watch
- `W-D` fixed workout execution
- `W-DP` paused execution
- `W-DE` execution exception/status
- `W-F` workout metrics
- `W-G` daily totals
- `W-H` controls
- `W-HP` paused controls
- `W-I` Finish confirmation
- `W-J` Cancel confirmation
- `W-K` two-leg finish/recovery
- `W-L` saved summary
- `W-S` system Health authorization sheet

Behavior that must remain fixed:

- The phone is the sole structured-workout authority.
- Watch owns the `traditionalStrengthTraining` indoor HealthKit workout lifecycle.
- Only one structured mutation may be in flight; retry reuses the same mutation identifier.
- Revisions are checked and failed or stale mutations never advance optimistically.
- Controls are physically left of the Workout page. A finger swipe right reveals them.
- Digital Crown remains vertical paging: Workout → Metrics → Daily Totals. Crown does not edit set values.
- The final set never auto-finishes the workout.
- Finish and Cancel are distinct, explicit confirmation boundaries.
- Finish is a recoverable two-leg PhysiqueOS + Apple Health operation.
- Watch does not own a performance-record celebration. The saved summary may show a PR count tile only.

Source-specific findings:

- Weighted, bodyweight (`BW`), weighted bodyweight (`BW + N`), and superset/linked labels are represented.
- Timed-set duration reaches the shared projection as `valueText`, but the Watch execution mapper/view currently renders only load/reps. The resulting `— / —` is documented as a source presentation gap; the mockup does not invent a duration control.
- A committed summary may state that Apple Health save needs retry, but the summary itself only exposes Done. Health retry exists on Controls while finishing.
- Always-On uses the same content at a 15-second tick. No custom privacy redaction or Reduce Motion branch exists in the current Watch view.
- There is no separate cancel-success screen. Duplicate/retry protection is deliberately not a visible state.
- Current hard-coded colors and several 8–10 pt labels, 32–34 pt actions, and incomplete VoiceOver summaries are implementation risks, not behavior to preserve.

## Live Activity / Dynamic Island

Primary source:

- `ios/PhysiqueOSShared/WorkoutActivityAttributes.swift`
- `ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift`
- `ios/PhysiqueOSLiveActivity/WorkoutLiveActivityWidget.swift`
- associated mapper, coordinator, client, App Intent, bridge, and root integration

Material templates found:

- `LA-Ø` no system surface
- `LA-L1` active Lock Screen
- `LA-L2` privacy-redacted Lock Screen
- `LA-L3` lifecycle/status Lock Screen
- `LA-E1` expanded Dynamic Island active
- `LA-E2` expanded privacy-redacted
- `LA-E3` expanded lifecycle/status
- `LA-C1` compact workout
- `LA-C2` compact rest
- `LA-M1` minimal workout/status
- `LA-M2` minimal rest ring

Behavior that must remain fixed:

- ActivityKit is a pure, revisioned, write-only projection of the phone-authoritative workout.
- It shows no more than two workout rows.
- Complete Set is the existing App Intent carrying the target revision and mutation identifier.
- No HealthKit, evidence, PR, finish, cancel, pause, resume, connectivity, or authorization ownership belongs here.
- All-set-complete, reviewing, finishing, and saved states use lifecycle/status shells.
- Compact/minimal content varies only between rest and non-rest presentations.
- Privacy redaction removes exercise/value details and the Complete Set action.

Source-specific findings:

- There is no separate initial/loading surface, in-app workout banner, ActivityKit alert configuration, mutation-failure UI, or saved CTA with meaningful navigation.
- Explicit pause and non-countdown stale safety currently collapse into the same copy: “Workout needs an update / Open Logger to refresh.” A mockup must not invent a semantically distinct paused state.
- A failed Complete Set intent has no Live Activity error surface.
- Weighted, bodyweight, timed, and superset values all pass through `valueText`; no separate visual layout is needed.

## Training Logger

Primary source is the current Training Logger SwiftUI flow, including `TrainingLoggerView.swift`, Logger support views/menus, pending-evidence surfaces, and `EvidenceReviewDetailView` for workout reconciliation.

Authoritative flow:

`Entry → Training Areas → Exercise Picker → Active Set Entry → Workout Review → Final Confirmation → Workout Complete`

Material visual templates found:

- `LG-System` system loading/error/alerts
- `LG-Entry` live or past workout entry
- `LG-Entry/Saved` draft resume/discard
- `LG-Selection` Training Areas
- `LG-Picker` library/all catalog selection and search
- `LG-Picker/Create/Candidate` provisional creation with collision candidates
- `LG-Active` live workout shell
- `LG-Exercise` exercise card and set table
- `LG-Set Editor` inline reps/load/bodyweight/timed fields
- `LG-Keyboard` focused numeric keyboard state
- `LG-Relationship Menu` variant/superset/substitute/reorder/remove
- `LG-Review/Evidence` review with no/pending/ready/failed attachments
- `LG-Finish` final confirmation, saving, long-save and error states
- `LG-Complete/Records` normal success and performance records
- `LG-Destructive Alert` Cancel and post-Finish discard
- `LG-Match` later ambiguous Apple Health workout reconciliation

Behavior that must remain fixed:

- Finish from the active workout opens Workout Review; Continue opens Final Confirmation; the second Finish commits.
- Set add/edit is inline. There is no Add/Edit Set sheet.
- Exercise variant, superset, substitute, reorder, and remove are menu actions.
- Ambiguous Apple Health matching occurs later through Log → Pending Evidence Reviews → Evidence Review Detail → Workout Match. It is not inline Logger.
- A trusted, exact Watch correlation does not produce generic match-review UI; it lands on the normal completion path.
- Evidence is optional supporting input. Images may be pending, ready, failed, or removed without changing workout authority.
- Save is idempotent and retries reuse the same operation identity; duplicate protection is not a new modal.
- Cancel Workout and post-Finish discard are confirmed. Saved-draft discard, set removal, exercise removal, and evidence removal are currently immediate.
- The importer currently accepts images only despite a stale source comment suggesting broader files.

Source-specific findings:

- There is no phone workout elapsed timer, pause/resume action, rendered active-rest surface, Watch-active/paused/reconnecting banner, notes field, favorites mode, workout-type picker, unchecked-set warning, or unsaved-changes alert.
- “Ready for Watch” exists only before the first completed set and disappears after Watch start.
- Phone edits continue projecting while Watch is active. A paused Watch may reject edits, but current Logger does not explain that rejection in a dedicated UI.
- The successful exact-correlation path is visually the standard Workout Complete screen.
- Confetti is one-time and visibility-gated; Reduce Motion suppresses it.
- Current Logger styling is scoped and predominantly dark. A mineral-light implementation would require scoped token/environment work rather than a global theme switch.

## Audit conclusion

All user-facing states map to one of the templates above or explicitly to `LA-Ø` when the system displays no surface. The coverage matrix carries the one-to-one mapping. The render set proves every materially distinct template, while yellow “source gap” labels distinguish missing presentation from proposed behavior.
