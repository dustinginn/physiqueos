# Redesign Implementation Batch 2 prep: Log + Training Logger

Task id: `redesign-batch2-log-training-prep-20261005`
Status: **PREP ONLY. Implementation-ready, pending Batch 1 Founder acceptance and integration authority.**
Agent: Claude (Remote Control session; single RC worktree; no EnterWorktree; no secondary worktree)
Generated (UTC): 2026-10-05T01:46:04Z

This is a separate lane from Codex A's Batch 1 (Home + Goals + You/Settings). The report contains no implementation, no shipping Native change, no Server change, no production mutation and no build or TestFlight action. Batch 1 is still in progress: the Codex A worktree has uncommitted edits to `PhysiqueOSTheme.swift` and Home views. This lane did not read, use or touch that work.

## 1. Exact authority

| Item | Value |
|---|---|
| Prompt | `97563259728caff262abb4b58eb2ab966ddd8345`, `agent-handoffs/inbox/prompts/20261005T014500Z-redesign-batch2-log-training-prep-claude.md` |
| Native authority (re-verified 2026-10-05T01:46Z) | `cec8af20a6121bb66ecca3ba9f667d91774a891c`, 1.0 (86), Apple VALID (delivery `e70f2604`). Branch `origin/claude/build86-final-integration-20261004`, which has no newer commits. No newer Native head exists on origin. |
| Batch 1 prompt | `f4bd9c50c6a0132d700f41cb894788e5a61d8ff6`. Codex A branch `codex/redesign-batch1-home-goals-you-20261005` is still at `cec8af20`, with uncommitted work in progress. |
| Server (context only, unchanged) | `27dad44a1f63d68b53f23e51152a10a5d04968e6` (Option A) |
| **Log design authority (locked)** | Compact Command Center: `selected-home-log-exploration-20261004` at `ec425a96`. Plus the realistic-density refinement and centralized Sources disclosure: `briefing-light-log-density-final-polish-20261004` at `97807d50` / `6029bbfa`. The lock is recorded in the main backlog ("Log Compact Command Center dark + mineral light is locked at realistic density. Centralized Sources is locked collapsed by default…") and in coverage-audit rows S04, L01–L03 and L06. |
| **Training Logger design authority (locked)** | Utility package `29d2fe1f` (L1–L17), plus the Founder Done-control correction `5b47063b` (44×44 `circle` / `checkmark.circle.fill`). Branch head `origin/codex/utility-surfaces-design` at `ca088e80`. The lock is recorded in coverage-audit row U01 (A) and in E24 for the ambiguous Workout Match (L13). **These artifacts exist only on that branch, not on `main`.** Implementation must cite `ca088e80` paths exactly. |
| Related locked families (boundaries only) | Evidence Intake + Review (E20–E23, Final Design Batch 1). Manual weight (L05, Final Design Batch 2). Watch U02 and Live Activity U03 (same utility package). |
| Implementation-delta ledger | Read in full at `origin/main`. |
| Excluded as authority | The temporary old-geometry global-appearance screenshots (`20261004-global-appearance`) |

Method:
- Three read-only source audits of Build 86: Logger states, Watch/HealthKit coupling, and Log + tests.
- The decisive claims were then hand-verified against source:
  - Log-tab routing;
  - the source-string tests;
  - `acceptsExternalContentMutation`;
  - Watch LOAD/REPS tiles;
  - `setReadyForWatch` clearing `startedAt`;
  - the Server's `LoggedTodayService` provenance.

## 2. Executive result

- **Log is presentation-only.** It has no workout-authority coupling and needs no read-model change, with one exception: the locked Sources disclosure (decision D1).
- **The Training Logger can be redesigned as presentation-only**, provided the rules in §6 hold: no new authority mutations, no step changes, unchanged mutation call sites, and unchanged source-string tripwires.
- **Batch 2 does not need to touch any of the following:**
  - Watch, Live Activity or widget files;
  - `TrainingSessionAuthority`;
  - draft store, write API, finish coordinator or terminal ledger;
  - `RootTabView`, `AppDestination*` or the Server.
- **Hard dependency on Batch 1: the redesign token set and shared primitives.**
  - Build 86's `PhysiqueOSTheme` holds dynamic Dark/Mineral pairs of the *old* palette. For example:
    - `background` is `#080D18`/`#F0EEE6`, versus the locked `#061019`/`#E8ECE5`;
    - `accent` is `#8B8CFF`.
  - The locked semantic roles do not exist as tokens yet: amber execution, teal evidence/intake, cyan rule, page/surface/soft.
  - Batch 1 is editing `PhysiqueOSTheme.swift` now. Batch 2 must inherit those tokens, not create them.
- **Four Founder/product decisions** are listed in §12. Only D1 blocks a locked Log element, and Batch 2 can start without it.

## 3. Exhaustive surface/state inventory

### 3.1 Log (tab root `LogView`; host `RootTabView` Log stack)

Shipping order is header, Logged Today, pending reviews, processing, Training Logger, Upload. The locked Compact Command Center (CCC) order is:

1. **Header** (unchanged copy): eyebrow "Log", title "What happened?", subtitle "Upload a screenshot, photo, PDF, or note and PhysiqueOS will organize it."
2. **Training Logger execution field.** Amber, at least 96 pt, copy unchanged. Routes to `.trainingLogger`.
3. **Logged Today** title plus `localDate`, then a **2×2 tile grid**:
   - Training: multi-line `lines` rendered line by line. Routes to `.trainingSession` / `.trainingDay`.
   - Nutrition: summary plus macro context. Routes to `.nutritionDay`.
   - Activity: "so far". Routes to `.activityDay`.
   - Weight: Native-synthesized from `weight.current`. Routes to `.progressStream(weight)`.
   - A tile with no destination is not tappable. A processing tile shows a spinner.
4. **Pending review band** (amber left rule), shown only when `pendingEvidenceReviews` is non-empty:
   - section title and subtitle;
   - per item: title, date · summary, the possible-duplicate warning when `likelyDuplicate`, and "Review before adding to your history →" to `.evidenceReview(id)`;
   - a workout-reconciliation review appears here as an ordinary item (entry to L13).
5. **Processing state** (no render in the CCC; covered by the CCC implementation notes):
   - "Processing" plus "`<label>` confirmation accepted · No action required";
   - not tappable;
   - generic domains only (`genericProcessingEvidenceReviews`).
6. **Quick actions, 2-column:**
   - "Log weight for another date" routes to `.manualWeighIn`.
   - "Add evidence" (primary, teal). In Production it pushes `.evidenceIntake`. In Sandbox it uses the `EvidenceSourceMenu` Photos/Files picker, then `.evidenceIntake`. It is disabled with "Loading selected photos…" while photos load.
7. **"Add details without an asset"** routes to `.evidenceIntake`. **Sandbox only:** "Continue draft · N file(s)".
8. **Upload caption**: "Upload · Add photos, files, or a note."
9. **Sources disclosure**, collapsed by default, one 44 pt row, at the true bottom above the tab bar. See D1.

Log states:

| State | Shipping behavior that must remain |
|---|---|
| loading | `.none` / `.loading` show a progress treatment in the principal region |
| error | Exact text "Log could not be loaded." There is no retry button; pull-to-refresh is the retry. Do not invent a button. |
| empty domain | The four tiles always render. The server says "Nothing logged yet", and the tile is not tappable unless a destination exists. Weight's empty tile still routes to the weight stream. |
| loaded | As above |
| pending present / absent | Band shown / hidden |
| processing (server) | Generic processing card |
| accepted-processing overlay | Local acknowledgement: removed from pending, tile shows "`<Kind>` processing" / "Confirmation accepted · No action required" plus spinner |
| Cardio-only / Strength+Cardio / `other` history | Server `lines` (`logger` / `cardio` / `other` kinds). Never relabel. Cardio fallback composed in `ProductionLogAPI` |
| refresh | Pull-to-refresh: Production HealthKit bootstrap, invalidate `evidence-review-queue` + `weight`, reload, notification sync |
| foreground / local-day change | Reload while visible |
| processing poll | `ProcessingRefresh` 3…30 s schedule. A failure keeps the last good state |
| notifications side effect | Production: authorization request plus `WorkoutReconciliationReviewReadyNotifier.reconcile` on load |
| Sandbox | `FixtureLogAPI` fixture (3 rows plus 1 review). Local sandbox reviews are not listed on Log |

Entry and deep-link behavior. All of it is preserved, and all of it is outside Batch 2 files:
- **Log-tab redirect.** Entering Log from another tab while `logPath` is empty routes to `logTabRoutingTarget()`: the live session, else a pending completion. It pushes `.trainingLogger` on top of Log.
  - Owner: `RootTabView.swift:218-227`.
  - Pinned by the source-string test `AppTabTests:149-164`.
- **Home widget** `physiqueos-workout://widget/*`:
  - summary → Log root;
  - training / nutrition / activity / weight → Log plus the destination;
  - start / resume → Logger, never creating a workout;
  - refresh → relay only.
- **Live Activity** `open?session=` → Logger, only if the draft exists.
- **Notifications** open on **Home's** stack, not Log.
- **There is no active-workout card on Log root** in shipping or in the locked design. The active workout is reached only by redirect or deep link.

### 3.2 Training Logger (`.trainingLogger` → `TrainingLoggerView`)

Flow: Entry → Areas (1 of 3) → Picker (2 of 3) → Active set entry → Workout Review → Final Confirmation → Workout Complete.

`step` is **persisted authority state**. The view switches on `isFinishConfirmed ? .review : step`.

| # | State | Source (`TrainingLoggerView` = V, `TrainingLoggerViewModel` = VM) | Locked target |
|---|---|---|---|
| G1 | Config loading | V 47-61 `.loading` | L1 shell |
| G2 | Config load failed: "Workout Logger couldn't be loaded. Try again." with no retry button | V 1368, VM 204 | L16 template; do not invent a retry |
| G3 | Read-only card (`!canWrite`). Unreachable in the current config | V 277-283 | L1 |
| E1 | Entry header "Training Logger / Log the work. Keep the context." | V 273-275 | L1 |
| E2 | Start Workout (live), `trainingLogger.start` | V 321-326 → `start(.live)` [authority mutation] | L1 |
| E3 | Log Past Workout plus compact DatePicker (≤ today), `trainingLogger.past` | V 328-350 | L1 / platform picker |
| E4 | Saved workouts list: Resume (`resume.<id>`) and Discard draft (`discard.<id>`, **immediate**, no confirmation) | V 285-319 | L1 |
| E5 | Routed resume from tab redirect, widget or Live Activity (`consumeTrainingLoggerResumeDraftId`) | V 101-104 (**source-pinned**) | n/a (behavior) |
| E6 | Relaunch restore: pending completion re-presented; Production durable check, then Complete or durability recovery | VM 151-206 | n/a (behavior) |
| A1 | Areas: "1 of 3 / What are you training?"; choices un/selected/multi; "Suggested Today" (server-owned, pre-select only) | V 354-413 | L2 |
| A2 | Continue disabled with no area / "Select at least one Training Area." | VM 349-355 | L2 |
| A3 | Back on Areas sets `draft = nil` (deselect only; the draft stays saved) | V 411 | L2 |
| P1 | Picker "2 of 3 / Choose exercises", My Library (default) ↔ All Exercises | V 415-497 | L3 |
| P2 | Search (name only), empty/results/no-results | V 426-434 | L3 |
| P3 | Select / deselect row. Production adds to My Library on select [Server write] and shows its error copy | V 499-543, VM 829-855 | L3 |
| P4 | Bottom bar "Start logging · N selected" | V 236-248 | L3 |
| P5 | Create New Exercise form (name plus area picker) | V 545-595 | L4 |
| P6 | Production create outcomes: created→auto-select / duplicate / candidates ("Use `<name>`") / error. Sandbox provisional "Provisional review" | VM 873-925 | L4 |
| P7 | Add Exercise mid-workout: header "Active workout / Add exercises", all areas, existing exercises locked, "Return to workout · N added" | V 642-652, RM 577-595 | L5→L3 |
| W1 | Workout identity: live/past dot, eyebrow, "Started now · N exercises" / date, "x/y sets", progress bar (`workoutIdentity`) | V 673-709, VM 965-984 | L5 |
| W2 | Ready for Watch / Ready on Watch toggle (only when 0 completed sets and ≥1 exercise) | V 600-615 | L5B |
| W3 | Rest preference menu: Stopwatch / Countdown m:ss / Off, "Applies from your next completed set." | RPM, V 640 | **Not drawn in L5. See C7** |
| W4 | Save & Leave (inline plus toolbar), Cancel Workout (alert), Add Exercise | V 617-652, 66-79 | L5 / L10 |
| W5 | Exercise card: name, context line (variant / "Superset with X + Y" / Ordinary · Standalone), Previous line or "No comparable prior performance…", `ellipsis.circle` menu | V 711-765 | L5 / L8 |
| W6 | Progression guidance: prescription plus "Use suggestion" / "Keep previous" | V 767-800 | **Not drawn in L5. See C7** |
| W7 | Set table "Set / Reps or Seconds / Load (lb) / Done", inline `NumericEditField` decimal pad with Previous/Next/Done | V 841-909 | L5 / L6 |
| W8 | Set incomplete / complete (explicit end state; success tint) | V 884-892, 907 | L5 plus Done correction |
| W9 | Measurement variants: weighted, reps-only, bodyweight (load optional), weighted-bodyweight, duration ("Seconds" plus Load column) | RM 21-25, 430-466 | L5 / L6 / L8 plus correction |
| W10 | Add set (copies last, uncompleted); delete set (**immediate**, disabled at 1, **no a11y label**) | V 753-761, 893-901 | L5 |
| W11 | Exercise menu: Execution variant ▸, Superset ▸ (Pair with / Remove superset), Substitute (same area), Move earlier/later, Remove exercise (**immediate**) | V 802-839 | L7 / L8 |
| W12 | Superset representation: text context line only, cards in flat draft order | V 654-656 | L8 ("SUPERSET A" label, cards unchanged) |
| W13 | Numeric keyboard visible, which hides Finish (`NumericEditingContract`) | V 111, 250 | L6 |
| W14 | Watch-coordinated session: no banner. Paused-Watch edits silently rejected | AUTH 816-818 | L9 (source gap kept) |
| W15 | Finish Workout (disabled unless at least 1 valid completed set; reason not shown) | V 250-258, VM 982 | L5→L11 |
| X1 | Cancel alert "Cancel this workout?" / Cancel Workout / Keep Workout | V 660-670 | L10 |
| R1 | Workout Review: header, Exercises/Sets/Variants/Supersets tiles, completed-set lines | V 911-1021 | L11 |
| R2 | Supporting screenshots: Photos / Files (image-only), pending "Reading…", recognized, failed "Couldn't read workout details", remove (immediate) | V 946-1014, 112-205 | L11 |
| R3 | "Continue to confirmation" / "Back to set entry" | V 1016-1020 | L11 |
| F1 | Final Confirmation "Finish this workout?". "Workout ready" card, Sandbox provisional note, validation/processing messages | V 1027-1097 | L12 |
| F2 | Primary button: Finish Workout / Finishing workout… / Saving… / Retry Finish (`completeLocal`) | V 1075-1083 | L12 / L16 |
| F3 | Still saving / Waiting for network after 20 s, plus Retry (same key) | V 1127-1154 | L16 |
| F4 | Discard Saved Workout after a definite failure (alert) | V 122-132, 1087-1095 | L16 / L10 template |
| F5 | Accepted-processing / result-unknown processing copy | VM 541-547 | L16 |
| C1 | Workout Complete "Workout logged" plus confirmed check (Reduce Motion aware) | V 1099-1122, 1271-1298 | L14 |
| C2 | New performance records (Server-only), one-time confetti plus haptic | V 1159-1269 | L15 |
| C3 | Refresh warning "Workout saved. Some details may be out of date…" | VM 585 | L14 |
| C4 | Return to Log: `acknowledgeCompletion` then `dismiss()` (**source-pinned**) | V 1118 | L14 / L15 |
| M1 | Later ambiguous Workout Match (Log → pending review → `EvidenceReviewDetailView` workoutReconciliation branch) | `EvidenceReviewDetailView.swift` | L13 (see D4) |
| M2 | Trusted exact Watch correlation: no review UI, normal Complete | reconciliation path | L14 |

Absent in both source and design, so do not invent them:
- phone rest clock or End Rest;
- elapsed timer;
- pause/resume control or paused banner;
- warm-up, drop or RPE set types;
- set reorder or swipe actions;
- template or routine start;
- notes, favorites or workout type;
- unchecked-set warning or duplicate modal;
- stale-revision UI;
- pending-sync badge;
- navigation from Logger to Evidence Review;
- Training Day "Use Logger" entry.

The only modal surfaces are the two `.alert`s, `.photosPicker`, `.fileImporter`, `Menu`s and pickers. There are no sheets, covers or `navigationDestination`s.

## 4. File / component ownership map

| Area | Batch 2 edits (presentation) | Read-only for Batch 2 (canonical owner) |
|---|---|---|
| Log root | `Presentation/Log/LogView.swift`, `LogHeaderView`, `LoggedTodayCardView`, `PendingEvidenceReviewsCardView`, `TrainingLoggerCardView`, `UploadCardView` | `LogViewModel`, `LogReadModel`, `ProductionDailyDriverAPI.ProductionLogAPI`, `LogAPI`, `ProcessingRefresh`, `EvidenceSourcePicker` (shared; restyle only through Batch 1 primitives) |
| Logger | `Presentation/TrainingLogger/TrainingLoggerView.swift` (split into new presentation files), `TrainingRestPreferenceMenu.swift` (label styling only) | `TrainingLoggerViewModel`, `TrainingLoggerReadModel`, `TrainingSessionState`, `TrainingSessionAuthority`, `TrainingLoggerDraftStore`, `TrainingWriteAPI`, `TrainingSessionTerminalLedger`, catalog loader/write API |
| Shared inputs | none, or Batch 1-owned only | `SharedUI/NumericEditField.swift` (UIKit focus/toolbar contract), `PhysiqueOSTheme.swift`, `Typography.swift`, `CardContainer`, `PrimaryActionButton`, `IconBadge`, `StatusChip`, `SectionHeading` |
| Routing | none | `RootTabView.swift`, `AppDestination*`, `AppDestinationRouterView` |
| Watch / LA / widget | none | `WatchWorkout*`, `PhysiqueOSWatch/*`, `WorkoutLiveActivity*`, `WorkoutActivity*`, `CompleteWorkoutSetIntent`, `HomeLoggedTodayWidget*`, `HomeWidgetBridge` |
| Evidence | Optional M1 branch subview only (D4) | `EvidenceReviewDetailView` generic states (E23), `ProductionEvidenceUploadView`, `ManualWeighInView` (other locked batches) |

Recommended Logger split. Create new files under `Presentation/TrainingLogger/`; each must be added to `generate_project.py`. They are pure views taking values and closures, so behavior stays in the view model:
- `LoggerEntryViews` (V 273-352)
- `LoggerSelectionViews` (Areas plus Picker plus Create, V 354-595)
- `LoggerExerciseCard` / `LoggerSetRow` (V 711-909)
- `LoggerReviewViews` (V 911-1097)
- `LoggerCompletionViews` (lift `FinishProgressStatus`, `NewPerformanceRecordsCard`, `ConfettiBurst` and `WorkoutCompleteConfirmation` as-is)

`TrainingLoggerView` keeps `body`, the `.task` / `.onAppear` / `.onDisappear` / `.onChange` / pickers / alerts, `content()`, `persistentAction` and every closure that calls the view model.

## 5. Batch 1 dependency map

**Wait for Batch 1** (inherit; do not implement replacements):
1. Locked semantic tokens in `PhysiqueOSTheme`: page, surface, soft surface, primary/secondary/muted ink, brand purple, success green, execution amber, evidence teal, rule cyan, rule/divider. The Build 86 tokens are old-palette pairs.
2. Typography roles (Plus Jakarta scale: 11 / 12 / 13–14 / 16–18 / 26–30 pt).
3. Card/surface containment, radius 12–16, border-driven depth (`CardContainer` successor).
4. Section header / eyebrow primitive.
5. Primary, secondary and destructive button styles (`PrimaryActionButton` successor; the 44 pt minimum).
6. Status chip / pill (icon plus label, never color alone).
7. Row treatment (open ruled row / action row).
8. Loading / error / empty treatments.
9. Navigation chrome and selected-tab treatment (`RootTabView` tint; Log tab item).
10. Spacing primitives (4 pt grid; 16 pt gutters).

**Safe to prepare independently, without touching shared files:**
- the Logger file split (§4) as a zero-visual refactor;
- Log tile-grid layout, including Dynamic Type linearization to one column;
- presentation-model value types (e.g. superset letter derivation, a saved-draft completed-set count);
- new deterministic tests (§9);
- `generate_project.py` pinned test block;
- the DEBUG route seam (`-physiqueos.appearance-review.route log | training-logger`), which already exists.

Even these should land after Batch 1 merges, to avoid project-file conflicts.

## 6. Build 86 Watch/HealthKit risk map (behavior-sensitive)

**Core fact.** `TrainingSessionAuthority` is the only writer. Every accepted mutation does all of the following in one step:
- persists;
- increments `revision`;
- synchronously notifies the Watch bridge (projection plus `finishCoordinator.reconcile`), the Live Activity coordinator, the Home widget bridge, and the view model.

So **every view → view-model mutation is a Watch, Live Activity and widget publish.**

| Sensitive item | Owner | Why it matters | Rule for Batch 2 |
|---|---|---|---|
| `step` transitions (`go(to:)`, `draft = nil`, `continueFromExercises`, `reviewWorkout`, `finishReview`) | VM → AUTH | Changes Live Activity phase. Gates external Complete Set (`acceptsExternalContentMutation`: step `.workout` or adding). Bumps revision | Same steps, same triggers. No step merges, skips or on-appear writes |
| Per-keystroke `setValue` | V 1383-1401 → VM 319 | One revision per keystroke (test `testSetEntryStaysLocalAndWritesOncePerKeystroke`); Live Activity coalesces value-only changes | Keep `numericBinding` and buffers byte-equivalent in behavior |
| `setCompletion(completed:)` | VM 311 / AUTH 690 | Explicit end state; starts rest; drives the Watch cursor | Done control calls exactly this; no blind toggle |
| `setReadyForWatch` | AUTH 317-332 | Clears `startedAt`, `finishedAt`, pause, `leftAt` and rest; moves the session to Watch "prepared"; ends the Live Activity | Show only when `completedSetCount == 0` and exercises are non-empty (unchanged) |
| Save & Leave (`leftAt`) / Cancel (`.cancelled`) / Discard after finish | VM / AUTH | Ends the Live Activity and Watch subject; terminal ledger | Same calls; same confirmations (Cancel and post-Finish discard confirmed; draft/set/exercise/evidence removal immediate) |
| Finish: `beginSubmission` **before** `confirmPhoneFinish`; frozen after `isFinishConfirmed` | VM 409-504 | Prevents `WatchWorkoutFinishCoordinator` from taking over; the idempotency signature covers dates, order, sets and supersets | No new mutation after confirmation; keep every disabled/hidden predicate (V 67-68, 250, 1075-1095) |
| Exercise order / relationships | RM `moveExercise`, supersets | Define the Watch cursor, two-row rule, superset labels and the idempotency signature | View may group visually; never reorder the model for layout. L8 keeps cards in draft order |
| Draft ids (`UUID().uuidString`), `startedAt` / `finishedAt` semantics | RM 215 / AUTH | HealthKit `HKMetadataKeyExternalUUID` and trusted correlation registry | Untouched |
| VM lifetime guard `if viewModelAuthority != environment.nativeAuthority {` | V 80-105 | Rebuilding re-runs recovery and leaks observers | Keep verbatim (**source-pinned**) |
| Celebration gate `isPresentationVisible: isSurfaceVisible && scenePhase == .active`, `feedback: environment.feedback` | V 1159-1269 | One-shot persisted key plus haptic | Keep verbatim (**source-pinned**) |
| App-level `scenePhase` reconcile (Live Activity plus Watch) | `PhysiqueOSApp.swift:136-172` | Not in Batch 2 files | Do not touch |
| Live Activity / Watch views and palettes | ActivityKit (class 3), Watch (dark-only, class 3) | Separate locked families (U02 / U03) | Out of Batch 2 scope |

**Pre-existing inconsistency, derived from code and not verified on device.**
- While the phone sits on Workout Review or Final Confirmation (`.summary` / `.review`), the Watch mapper's `phase(of:)` ignores `step` and stays `.active`. So the Watch can offer Complete Set, which the authority then refuses (`sessionNotMutable`).
- The Live Activity correctly hides it (`.reviewing`).
- The redesign does not change step semantics, so exposure is unchanged.
- Logged to the ledger; not fixed.

**Timed-set known gap** (ledger "Apple Watch Logger — timed-set duration projection mapping", OPEN):
- **The model and Live Activity are correct.** `durationSeconds` reaches `SetCue`. `valueText` gives "45 s", and the Live Activity renders it.
- **The Watch is wrong.**
  - `WatchWorkoutContracts.Row` has no duration or measurement field.
  - `WatchWorkoutViews.splitMetrics` renders fixed LOAD/REPS tiles from `loadText` / `repsText`, giving "—" / "—" or "BW". The duration is never shown.
- **Batch 2 touches the same model only on the phone side**, in the set-row "Seconds" column. It does **not** need `WatchWorkoutContracts`, `WatchWorkoutProjectionMapper`, `WatchWorkoutViews` or `TrainingSessionLiveProjection.valueText`.
- **Integration risk: low**, as long as Batch 2 leaves `valueText` untouched (changing it would change Live Activity text).
- **Recommendation.** Fix the gap in a separate Watch lane (contract field plus mapper plus tile labels, with Watch schema compatibility). Batch 2 adds regression tests pinning today's phone-side and Live Activity timed-set behavior, so a later fix cannot regress the phone.
- **Coverage gap.** No test asserts the timed `valueText` or a timed Watch/Live Activity row.

## 7. Global appearance map

Infrastructure:
- `AppAppearance` (System / Dark / Light), `AppAppearanceStore` (UserDefaults `physiqueos.appearance.preference.v1`).
- The root `.preferredColorScheme`.
- Static `PhysiqueOSTheme.<token>` colors built with `UIColor { traits in … }`.
- No environment theme object. Batch 2 must not add a scoped `LoggerUtilityTheme`, even though the utility token proposal suggested one. The global system supersedes it (C5).

| Owner | Current | Batch 2 target |
|---|---|---|
| Log views | All tokens except **`UploadCardView.swift:58` `.foregroundStyle(.white)`** on the accent capsule | Batch 1 tokens; replace `.white` with an on-action ink token |
| Logger view | 127 token uses. Non-token items: `.ultraThinMaterial` bottom bar (V 269), `role: .destructive` system red in menus/alerts, system TextField/DatePicker/Picker/Menu styling, opacity/radius literals | Tokens for every product-owned color. Material may remain only if it resolves in both appearances (verify contrast) |
| `NumericEditField` | `UIColor(PhysiqueOSTheme.surfaceMuted)` plus system text and UIToolbar | Shared (Batch 1 owns any change); verify keyboard appearance follows the scheme |
| `PrimaryActionButton` | `.white` label on accent; `.dark` tone uses fixed `actionDark` | Batch 1 primitive |
| Live Activity | Own fixed `WorkoutActivityPalette` (class 3) | Untouched |
| Watch | Dark-only (class 3) | Untouched |

Intentional semantic colors to keep. Each must remain paired with text, icon or shape:
- set complete: success green plus checkmark;
- Cancel / discard / remove: destructive plus explicit noun;
- Finish / execution: amber;
- Watch preparation: teal functional field;
- relationship / selection: purple;
- possible-duplicate warning: effort/amber;
- pending review band: amber;
- tile tones: Training teal, Nutrition green, Activity amber, Weight cyan;
- PR card: success.

## 8. Parity matrix

Abbreviations:
- **Design:** CCC = locked Log Compact Command Center; L# = locked Logger package screen.
- **Appearance:** all rows require Dark, Mineral Light, and System resolving to each, unless noted.
- **Batch 1 dependency (B1):** T tokens, C cards, H headers, B buttons, S chips, R rows, LE loading/error/empty, Ty typography, Sp spacing, N nav chrome.
- **Sensitivity:** — none; P projection-publishing mutation; F finish/commit; H HealthKit/Watch; LA Live Activity.
- **Tests:** AUTH `TrainingSessionAuthorityTests`, TLT `TrainingLoggerTests`, B83 `Build83FinishLifecycleTests`, LP `TrainingSessionLiveProjectionTests`, LAC/LAK/LAI `WorkoutLiveActivityCoordinator/Contract/IntentTests`, TAU `TrainingAcceptanceUITests`, FSA `FounderServerAPITests`, LRM `LogReadModelTests`, ATT `AppTabTests`, PPU `PhotoProcessingUXTests`, HWT `HomeWidgetTests`, SUI `SharedUITests`, NEW = add (§9).

| Surface/state | Current route/source | Canonical owner | Design | B1 | Sens. | Risk | Required tests |
|---|---|---|---|---|---|---|---|
| Log loading | LogView 100-103 | LogViewModel | CCC notes | LE,T | — | L | NEW-LogUI |
| Log error (no retry) | LogView 104-108 | LogViewModel | CCC notes | LE,Ty | — | L | NEW-LogUI, PPU |
| Log header | LogHeaderView | static copy | CCC | H,Ty | — | L | NEW-LogUI |
| Training Logger execution field | TrainingLoggerCardView | `.trainingLogger` | CCC | B,T | — | L | TAU (label "Training Logger") |
| Logged Today 2×2 tiles (4 kinds) | LoggedTodayCardView | ProductionLogAPI / Server | CCC density | C,T,Ty,Sp | — | M (Dynamic Type) | LRM, FSA ProductionLog*, NEW-LogUI |
| Training multi-line / Cardio-only / `other` | LogReadModel.lines | Server `LoggedTodayService` | CCC density | R | — | L | FSA (Strength+Cardio, never mislabel `.other`) |
| Nutrition macros context | context string | Server | CCC density | — | — | M (D1) | FSA, NEW-Sources |
| Activity "so far" | summary | Server | CCC density | — | — | L | FSA |
| Weight tile (synth) | ProductionLogAPI 992-999 | Native exact-date | CCC density | — | — | L | FSA weight tests |
| Empty tile / non-tappable | destination nil | Server/Native | CCC notes | R | — | L | LRM |
| Processing tile overlay | 908-966 | local ack plus Server | CCC notes | S | — | L | PPU, FSA |
| Pending review band (+ duplicate warning) | PendingEvidenceReviewsCardView | Server queue | CCC | R,S,T | — | L | LRM, NEW-LogUI |
| Workout-reconciliation pending item | same (kind) | Server plus notifier | CCC / L13 entry | R | H (indirect) | L | PriorityNotificationScheduler reconciliation tests |
| Generic processing card | LogView 130-147 | Server | CCC notes | S,LE | — | L | PPU |
| Quick action: weight for another date | UploadCardView 23-29 | `.manualWeighIn` | CCC | B | — | L | TAU (:38-39) |
| Quick action: Add evidence (Prod push / Sandbox menu / loading photos) | UploadCardView 45-74,104-129 | Prod/Sandbox intake | CCC | B | — | M | TAU, NEW-LogUI (`log.addEvidence`) |
| Add details without an asset | UploadCardView 76-85 | `.evidenceIntake` | CCC | B | — | L | NEW-LogUI |
| Sandbox Continue draft | UploadCardView 87-100 | LoggingSandboxStore | CCC notes | B | — | L | LoggingSandboxTests |
| Sources disclosure (collapsed / expanded) | **none** | **no structured contract** | CCC density | R,S | — | **H (D1)** | NEW-Sources (blocked by D1) |
| Pull-to-refresh / foreground / day change / poll | LogView modifiers | LogView / ProcessingRefresh | n/a (behavior) | — | — | L | PPU, FSA |
| Log-tab redirect into active workout | RootTabView 218-227 | AUTH routing | n/a | — | P (read) | L (untouched) | ATT (source-pinned) |
| Widget / Live Activity deep links to Log/Logger | RootTabView 113-178 | Root | n/a | — | LA | L (untouched) | HWT, TAU :526, LAK |
| Logger loading / load-failed | V 47-61, 1368 | VM | L1 / L16 | LE | — | L | NEW-LoggerUI |
| Entry: Start / Past / date | V 321-350 | VM.start → AUTH | L1 | B,C | P | M | TAU, AUTH |
| Saved drafts Resume / Discard | V 285-319 | AUTH | L1 | C,B | P,LA | M | TLT, AUTH, LAC (:254) |
| Routed resume / relaunch restore | V 80-105, VM 151-206 | AUTH / VM | n/a | — | P,F | **H** (source-pinned) | ATT, TLT :1924, TLT relaunch |
| Areas + Suggested Today | V 354-413 | VM / Server config | L2 | C,S,B | P | M | TAU |
| Picker: Library / All / search / select / count | V 415-543 | RM / VM / My Library write | L3 | R,B | P | M | TLT, TAU |
| Create / collision candidates / provisional | V 545-595, VM 873-925 | catalog write API | L4 | C,B | P | M | TLT |
| Add Exercise mid-workout (locked rows) | V 642-652 | RM | L5→L3 | B,R | P | M | TLT |
| Workout identity / progress | V 673-709 | VM presentation | L5 | H,S | — | L | TAU (`workoutIdentity`) |
| Ready for Watch / Ready on Watch | V 600-615 | AUTH.setReadyForWatch | L5B | B,T | **H,LA,P** | **H** | AUTH Build 86 Health start, NEW-ReadyVisibility |
| Rest preference menu | RPM | device pref → normalize | not drawn (C7) | B | P (rest) | M | TrainingRestPreferenceTests, TAU :384 |
| Save & Leave / Cancel alert / Keep | V 617-670 | AUTH | L5 / L10 | B | P,LA,H | M | TAU, LAC (:254, :268) |
| Exercise card + previous perf + context | V 711-765 | RM | L5 / L8 | C,Ty | — | M | TLT |
| Progression guidance | V 767-800 | RM | not drawn (C7) | B | P | M | TLT |
| Set row: weighted / reps / bodyweight / weighted-BW / timed | V 841-909 | RM / AUTH | L5 / L6 / L8 + Done correction | R,T | P | **H** | TLT :509, AUTH :1445, B83 :825, NEW-TimedPin |
| Done control (explicit end state, 44×44) | V 884-892 | AUTH.setCompletion | Done correction | T | **P,H,LA** | **H** | TAU (labels), AUTH, LP |
| Numeric focus / keyboard / Finish hidden | V 111, NumericEditField | `NumericEditingContract` | L6 | — | P | **H** | TLT :319, NEW-FocusUI |
| Add set / delete set | V 753-761, 893-901 | RM | L5 | B | P | M | TLT |
| Exercise menu (variant / superset / substitute / move / remove) | V 802-839 | RM | L7 | B | **P (order)** | **H** | TLT, LP superset ordering |
| Superset label "SUPERSET A" | context line | relationships | L8 | S | — | M | NEW-SupersetLabel |
| Watch-coordinated / paused (no banner) | AUTH | AUTH | L9 | — | H | M | AUTH, WatchWorkoutFinishStateTests |
| Finish Workout (disabled rule) | V 250-258 | VM.canFinish | L5→L11 | B | — | M | TAU |
| Workout Review metrics + set lines | V 911-945 | RM | L11 | C,S | — | L | TAU |
| Supporting screenshots (pending / ready / failed / remove) | V 946-1014 | VM / evidence local OCR | L11 | R,S,B | P (evidence) | M | TLT OCR, TAU :450 |
| Final Confirmation | V 1027-1097 | VM finish | L12 | C,B | **F** | **H** | B83, TAU |
| Finishing / Saving / Retry Finish | V 1075-1083 | VM / WAPI idempotency | L12 / L16 | B | **F** | **H** | B83 :441-490, TLT :1510-1617 |
| Still saving / Waiting for network + Retry | V 1127-1154 | VM / connectivity | L16 | S,B | **F** | **H** | B83 |
| Discard Saved Workout (post-Finish) | V 122-132, 1087 | AUTH / ledger | L16 / L10 | B | **F,H** | **H** | B83 :613-672 |
| Workout Complete / Reduce Motion | V 1099-1122 | VM / AUTH | L14 | H,Ty | — | M | TAU :485, TLT |
| Performance records + confetti / haptic | V 1159-1269 | Server records / gate | L15 | C,S | — | M (source-pinned) | TLT :1278-1330, :1997 |
| Return to Log | V 1118 | AUTH.acknowledgeCompletion | L14 / L15 | B | P | M (source-pinned) | TLT :1997, TAU |
| Workout Match (ambiguous) | EvidenceReviewDetailView branch | Server review / commands | L13 | C,B | H (indirect) | M | Evidence review tests, FSA reconciliation |
| Trusted exact correlation | normal Complete | correlation registry | L14 | — | H | L | AUTH :574-697 |
| Live Activity / Watch | separate targets | coordinators | U02 / U03 | — | LA,H | out of scope | LAC/LAK/LAI/LAV, Watch suites |

## 9. Test plan

**Mandatory existing gates.** Must pass before and after every checkpoint:
- `PhysiqueOSTests`:
  - **TrainingSessionAuthorityTests** (81)
  - **Build83FinishLifecycleTests** (36)
  - **TrainingLoggerTests** (~89, including source-string tripwires :128-135 and :1997-2006, and the `CFBundleVersion == "86"` pin :1801)
  - **TrainingSessionLiveProjectionTests** (24)
  - **WorkoutLiveActivityCoordinatorTests** (31), **WorkoutLiveActivityContractTests** (14), **WorkoutLiveActivityIntentTests** (15), **WorkoutLiveActivityViewTests** (7)
  - **WatchWorkoutTransportTests** (3)
  - **TrainingRestPreferenceTests** (8)
  - **AppTabTests** (11, source-pinned :149-164)
  - **LogReadModelTests** (14)
  - **FounderServerAPITests** (ProductionLog*, weight, intake, reconciliation)
  - **PhotoProcessingUXTests** (16)
  - **HomeWidgetTests** (22)
  - **SharedUITests** (28, including appearance contrast)
  - **LoggingSandboxTests** (85)
  - **PriorityNotificationSchedulerTests** (reconciliation subset)
- `PhysiqueOSWatchTests`: **WatchWorkoutFinishStateTests** (40), **WatchWorkoutReducerTests** (7).
- UI: **TrainingAcceptanceUITests** (16; not reported as run at `cec8af20`, so run it at base first), **FoamRollingPriorityDetailUITests** (6; appearance routes include `log` / `training-logger` / `manual-weight`), **WatchWorkoutNavigationUITests** (7).

**Known pre-existing failures.** Classify these; do not expand them:
1. `PeptideSupportEditorViewModelTests` :616 (clock-sensitive).
2. `WatchWorkoutNavigationUITests.testFinalSetFinishShowsConfirmation…` :89 (DEBUG fixture never activates WCSession).

**Base step.** Run the full suites at the Batch 1 integration head before any Batch 2 commit, so baseline failures are recorded.

**New deterministic tests.** Add each to `generate_project.py` in a new pinned ID block after `0x1C01`, otherwise regeneration silently drops it:
- **NEW-LogUI.** A UI test via `-physiqueos.appearance-review.route log` in Dark and Mineral (sandbox fixture). Asserts:
  - section order: Training Logger → Logged Today → review → quick actions → Sources;
  - every destination tap;
  - `log.addEvidence`;
  - ≥44 pt targets.
  - Add stable ids `log.trainingLogger`, `log.today.<kind>`, `log.review.<id>`, `log.weightForDate`, `log.detailsWithoutAsset`, `log.sources`. Keep existing labels so `TrainingAcceptanceUITests` still matches "Training Logger".
- **NEW-Sources** (after D1). Collapsed default, expanded scope per contract, VoiceOver group "Evidence sources".
- **NEW-LoggerUI.** A Dark/Mineral walk of L1 → L15 on the sandbox fixture: start, areas, picker, set entry, review, confirm, complete. Asserts every existing id and label from §11 of the source inventory still resolves.
- **NEW-TimedPin.** A unit test that a duration set projects `valueText == "45 s"` into the Live Activity `ContentState`, plus a phone set-row "Seconds" column test. This pins pre-fix behavior; the Watch fix is out of scope.
- **NEW-ReadyVisibility.** The Ready for Watch control renders iff `completedSetCount == 0 && !exercises.isEmpty` (view-presentation predicate test).
- **NEW-NoExtraMutations.** A revision-count test: render each step's presentation model and assert `revision` is unchanged by appear/disappear and by switching appearance. Guards on-appear writes.
- **NEW-DoneTarget.** Accessibility frame of the Done control ≥44×44; labels "Mark set complete" / "Mark set incomplete" unchanged; the delete control gets an a11y label (additive).
- **NEW-SupersetLabel.** Pure derivation of "SUPERSET A/B…" from `relationships` without reordering.
- **NEW-FocusUI.** Previous/Next/Done order follows visible set order, and the sticky Finish never covers the focused field.
- **Appearance tests.** For each new primitive used, add a contrast check to `SharedUITests` (primary ≥7:1, secondary ≥4.5:1, per the global-appearance gate). Test switching System → Dark → Light mid-workout; assert no `revision` change.

**Watch projection regression.** Run `TrainingSessionLiveProjectionTests` and `WatchWorkoutFinishStateTests`. Do a manual sandbox check that the Watch subject is unchanged across Logger steps (same projection JSON before and after Batch 2 for one fixture workout). This can be asserted with a fixture-level projection snapshot test (NEW-ProjectionSnapshot).

**Finish/reconciliation.** Run `Build83FinishLifecycleTests` and the `TrainingLoggerTests` submission/durability ranges unchanged.

**Release compile.** Use the command documented in the Build 86 reports:

`xcodebuild build -scheme PhysiqueOS -configuration Release -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO`

It covers the app, Watch app and Live Activity appex.

**Operational notes:**
- Run `-only-testing:PhysiqueOSTests` and the UI bundle separately.
- Erase the simulator before trusting a single-commit UI failure.
- Check `uptime` / `vm_stat` and free disk first; this Mac periodically hits resource exhaustion.

## 10. Implementation sequence (after Batch 1 acceptance)

0. **Rebase.** Fetch the accepted Batch 1 integration head. Confirm no newer Native authority. Record baseline test results (§9 base step).
1. **Zero-visual Logger split.**
   - Move the V sub-views into new presentation files, unchanged.
   - Keep `body`, modifiers, `content()`, `persistentAction` and the source-pinned strings in `TrainingLoggerView.swift`.
   - Regenerate the project and confirm the regeneration is byte-stable.
   - Gate: the full mandatory suite is identical to baseline. *Checkpoint 1: no pixel change.*
2. **Add the new tests** (§9) at their pre-redesign values, so later steps prove parity.
3. **Logger primitives** on Batch 1 tokens/components: `LoggerStepHeader`, `LoggerExerciseCard`, `LoggerSetRow` (Done correction 44×44 / 28 pt), `LoggerNumericFieldStyle`, `LoggerEvidenceStateRow`, `LoggerFinishStatePanel`, `LoggerSuccessRecordsPanel`. Presentation-only value inputs.
4. **Logger active session (L5–L10):** set table, menus, superset label, Ready for Watch field, Save & Leave / Cancel, sticky Finish. *Checkpoint 2: Dark + Mineral simulator captures against L5/L5B/L6/L7/L8/L10 plus the Done correction.* Run AUTH, B83, LP and LA suites.
5. **Logger entry and selection (L1–L4).** *Checkpoint 3.*
6. **Logger review / finish / complete (L11, L12, L14–L16).** Keep every predicate and pinned string. *Checkpoint 4.* Run the full B83 and TLT suites.
7. **Log CCC** (tiles, review band, quick actions, processing, loading/error). Sources stays behind D1. *Checkpoint 5.*
8. **Sources disclosure**, only after D1 is resolved.
9. **Optional L13 Workout Match branch** (D4).
10. **Full gates:** all suites, Release compile, visual acceptance matrix (§11), ledger update, report. No TestFlight in this batch unless separately authorized.

Each checkpoint is one commit on a Batch 2 branch created inside the single RC worktree.

## 11. Visual acceptance matrix

**Capture method.** Real iPhone simulator at the locked 402 pt width target (iPhone 17 Pro-class), with paired Dark and Mineral Light captures for every row. Use the DEBUG route seam and the sandbox fixture; extend the fixture where a state needs it. Compare side by side against the locked PNGs:
- Log CCC: `selected-home-log-exploration-20261004/screens/command-*` and `briefing-light-log-density-final-polish-20261004/screens/log-*`.
- Logger: `ca088e80:utility-surfaces-design-20261004/screens/logger-l*.png` (with `-light`) and `utility-surfaces-acceptance-corrections-20261004/screens/logger-*`.

Do not render new designs.

| # | Capture | Fixture/state | Locked reference |
|---|---|---|---|
| V1 | Log loaded, realistic density | Strength + Cardio lines, macros, Activity so far, Weight, 1 review | log-command-density-*-full |
| V2 | Log empty day | all "Nothing logged yet" | CCC notes (no render; hierarchy from V1) |
| V3 | Log pending duplicate warning | `likelyDuplicate` | CCC review band |
| V4 | Log processing (generic plus tile overlay) | processing review | CCC notes |
| V5 | Log loading / error | forced states | CCC notes |
| V6 | Log Sources collapsed / expanded | after D1 | log-sources-collapsed-* / log-sources-* |
| V7 | Log at accessibility Dynamic Type | grid linearized | CCC accessibility notes |
| V8 | Logger entry with saved draft | 1 saved draft | L1 |
| V9 | Areas with suggestion | Chest+Back selected | L2 |
| V10 | Picker / search / count | 2 selected | L3 |
| V11 | Create plus collision candidate | candidates | L4 |
| V12 | Active workout | 3 exercises, mixed done | L5, L17D/L17L |
| V13 | Ready for Watch | 0 completed sets | L5B |
| V14 | Numeric keyboard focus | focused load | L6 |
| V15 | Exercise menu open | menu | L7 |
| V16 | Superset plus bodyweight | linked pair | L8 + logger-superset-* |
| V17 | Weighted Done states | complete and incomplete | logger-weighted-* |
| V18 | Timed set row | duration exercise | Done-correction propagation |
| V19 | Cancel alert | alert | L10 |
| V20 | Review with pending / ready / failed screenshots | 3 assets | L11 |
| V21 | Final Confirmation | ready | L12 |
| V22 | Long save / Waiting for network / Retry plus Discard | forced 20 s | L16 |
| V23 | Workout Complete, no records / with records | records fixture | L14 / L15 |
| V24 | Workout Match (if D4 = in Batch 2) | 2 candidates | L13 |
| V25 | System appearance resolving Dark and Light | OS toggled | parity with V1 / V12 |

## 12. Conflict check

| # | Conflict | Class | Handling |
|---|---|---|---|
| C1 | **Sources disclosure needs structured provenance.** Server `LoggedTodayService` exposes the source only as the literal "Apple Health" suffix inside `context` (e.g. "215P · 161C · 111F · Apple Health"); training lines carry only `kind` (`logger` / `cardio` / `other`). Native has no source field. Removing "Apple Health" from tiles and centralizing it requires a contract. | **Genuine Founder/product decision (D1)** | Do not parse display strings. Recommended: a small Server read-model addition (structured `sources` per row/line), then Native. Interim: ship CCC with the Server context verbatim in tiles, without Sources. |
| C2 | **Finish-leg rows in L12/L16** ("PhysiqueOS Ready", "Apple Health match · After save", "Workout operation · same key") have no single phone-side source. `submissionState` backs the PhysiqueOS leg. `watchHealthSaveState` exists only for Watch-recorded workouts. Past workouts and no-Watch sessions have no Apple Health leg. | **Genuine Founder decision (D2)** | Recommended: bind the rows to source states only. PhysiqueOS ← `submissionState`. Apple Health row only when `expectsWatchHealthWorkout`, else omitted. No static "After save" claim. |
| C3 | **Copy deltas in the harness** versus shipping copy: "LIVE WORKOUT" vs "Workout in progress"; "Today · Started 9:14 PM" vs the static "Started now · N exercises"; "4 of 9" vs "x/y sets"; saved-draft "· 4 completed sets"; "Start logging · 2 exercises" vs "· N selected"; L4 "POSSIBLE MATCH / Use existing exercise" vs "Use `<name>`"; L13/L14 sublines. Shipping strings are pinned by UI tests. | **Founder decision, low priority (D3)** | Default: keep shipping copy (canonical and test-pinned). Adopt design copy only where it is a truthful derivation from draft state (e.g. a real start time instead of "Started now"), after confirmation. |
| C4 | **L13 Workout Match** sits in `EvidenceReviewDetailView`, a file shared with the separately locked E23 generic Evidence Review batch. | Implementation sequencing (D4) | Recommended: implement in Batch 2 as the last isolated step, confined to the workoutReconciliation branch. Move to the Evidence batch if that batch is scheduled first. |
| C5 | The Logger token proposal (scoped `LoggerUtilityTheme`, utility hex values) predates the global appearance infrastructure. | Implementation detail | Use Batch 1 global tokens; no scoped theme. |
| C6 | Superset "SUPERSET A" label versus current "Superset with X + Y"; cards not regrouped. | Implementation detail | Derive the letter from `relationships` in presentation. Never reorder the model. Keep the context text available to VoiceOver. |
| C7 | **The Rest preference menu and progression guidance are shipping controls not drawn in L5.** Removing them would regress Build 77+ behavior (`TAU testRestPreferenceMenu…`) and progression semantics. | Design target requires existing behavior preserved (canonical wins; surfaced) | Retain both controls in the locked grammar: rest as a quiet secondary control in the logger controls row; progression inside the exercise card. Flag for Founder visual review at Checkpoint 2. |
| C8 | Done control: 21 pt in a 42×40 frame becomes 28 pt in 44×44; row height 42→52 pt. | No conflict (locked correction) | Implement as specified. |
| C9 | Watch-paused silent rejection, no Watch-active banner, no phone rest clock or timer. | Design target requires existing behavior preserved invisibly | No new UI (L9 source gap kept). |
| C10 | Cancel and post-Finish discard are confirmed; draft discard and set/exercise/evidence removal are immediate. | No conflict | Preserve exactly. |
| C11 | Dropped error copy: start failure, discard refused, the `reviewWorkout` reasons and the paused rejection are set but never rendered, and the config load error has no retry. | Likely shipping defect (pre-existing; ledger) | Not fixed in Batch 2 unless the Founder authorizes. The redesign must not newly hide any copy that is rendered today. |
| C12 | Log error state has no retry button. | No conflict | Pull-to-refresh only, per CCC notes. |
| C13 | The Log `UploadCardView` "Add evidence" menu is ignored in Production (always pushes intake). | No conflict | Preserve. |
| C14 | The Watch offers Complete Set during phone Review/Confirmation, and the authority refuses it. Code-derived, unverified on device. | Likely shipping defect (pre-existing; ledger) | Not Batch 2. Do not lengthen time in the review steps. |

### Decisions required (Founder/ChatGPT)

- **D1 (blocks only the Sources element).** Approve a structured provenance field on the Log read model (Server + Native), or ship CCC without Sources and with tile context verbatim.
- **D2.** Approve source-bound finish-leg rows (recommended) or omit them.
- **D3.** Keep shipping copy (recommended default) or adopt the listed design copy.
- **D4.** Place L13 Workout Match in Batch 2 (recommended, last step) or in the Evidence batch.

## 13. Blockers

- **Batch 1 Founder acceptance and integration head.** Hard gate for every visual step: tokens, primitives and `PhysiqueOSTheme` ownership.
- **D1** gates only the Sources disclosure.
- None of the following is needed: Server change (except via D1), production mutation, TestFlight or Watch change.

## 14. Ledger

Reviewed in full. Three entries were appended with this report:
1. Log Sources structured provenance (REQUIRED FOR DESIGN IMPLEMENTATION / FOUNDER DECISION).
2. The Watch offering Complete Set while the phone is in Review/Confirmation (LIKELY SHIPPING DEFECT, unverified).
3. Logger error copy set but never rendered (LIKELY SHIPPING DEFECT).

The timed-set entry was re-verified against Build 86 and remains OPEN, with a precise description added in this report (§6).

## 15. Shipping isolation

- Native source: unchanged.
- Server: unchanged.
- Production: no mutation.
- Build/TestFlight: none.
- Worktree: the single RC worktree only. No EnterWorktree and no secondary worktree. The publication was made with git plumbing from this worktree.
- Codex A Batch 1: not touched or duplicated.

Stop reason: Batch 2 is implementation-ready, pending Batch 1 Founder acceptance and integration authority, plus D1–D4.
