# Build 90 design round: implementation audit

**Base:** Build 89 shipped source `51399425`. Line numbers refer to that base.

**Scope of this round:** read-only audit plus DEBUG-only review seams. No production behavior is implemented yet.

**Server:** none of the four items needs a Server change.

---

## Item 1: iPhone Logger rest stopwatch (GitHub #7)

### What exists today
- **State authority.** The canonical rest authority already exists and is complete. `TrainingSessionRestState` (`Contracts/TrainingSessionState.swift:48-72`) holds an absolute `startedAt` anchor, optional countdown `endsAt` / `durationSeconds`, and `frozenElapsedSeconds` / `frozenRemainingSeconds` while paused. It lives on `TrainingLoggerDraft.rest`, and `TrainingSessionAuthority` is the only writer.
- **When rest changes.**
  - It starts in `TrainingSessionInvariants.normalize` on every incomplete→complete set transition (`:369-389`).
  - It is cleared when:
    - the source set is unchecked;
    - the session stops being live, or is left, submitted or completed;
    - Ready for Watch is set;
    - Finish is stamped, or the session is marked finishing;
    - Save & Leave runs;
    - the session ends.
  - Pause/resume re-anchors it (`TrainingSessionAuthority.swift:263-300`).
- **Watch and Live Activity** both derive from it:
  - Watch: `WatchWorkoutProjectionMapper.swift:53-64` and `WatchWorkoutStore.visibleRest`.
  - Live Activity: `WorkoutActivityContentMapper.swift:57-64` and `WorkoutRestClockText`.
- **Build 83 rule.** Rest is hidden whenever Finish confirmation is open, after finish, or during submission (`TrainingSessionLiveProjection.make`, `:174-188`). Not Yet restores rest from its anchor. This is pinned by `Build83FinishLifecycleTests` (`:196`, `:216`, `:490`).
- **The gap.** The iPhone Logger never reads `draft.rest`. Its only rest UI is the `Rest · Stopwatch` preference menu (`TrainingRestPreferenceMenu`).

### Design constraint (met by all options)
- **Rendering.** Every option renders from `viewModel.draft?.rest` through one presentation (`Build90LoggerClock` in the seam), gated exactly like `TrainingSessionLiveProjection`.
- **Clock.** The clock is a declarative `Text(timerInterval:)` from the canonical anchor, the same as the Live Activity. Nothing ticks or owns state. Paused values use the frozen fields.
- **Synchronization.** Phone, Watch and Live Activity stay synchronized because all three read the same anchor.
- **Phone-only.** It works with no Watch or Live Activity: Sandbox Logger with no Watch shows it.

### Source files a production change touches
- `Presentation/TrainingLogger/TrainingLoggerView.swift`:
  - `persistentAction` (`:337`);
  - `persistentActionBar` (`:366`);
  - the selected option's component.
- Optional view-model wrapper for `TrainingSessionAuthority.endRest(sessionId:restId:)` (`:730-736`, currently unused) if a Stop/Reset rest gesture is wanted. None of the options requires it.

### Manual controls (issue #7: "if existing semantics permit")
The authority already has:
- `endRest(sessionId:restId:)`, unused in production; it could back an explicit "End rest".
- `pause` / `resumePaused`, which only the Watch triggers. These are workout-level, not rest-only.

None of the three options adds controls yet; each is a read-only clock. Recommendation: if any control is wanted, expose only End rest via `endRest`, and keep pause on the Watch, to avoid a second phone pause UX. This is an open Founder decision (D-1a).

### Expected conflicts and constraints
- **Keyboard.** The sticky bar hides while the numeric keyboard is up (`NumericEditingContract.finishActionVisible`). All three options inherit that, so the stopwatch is hidden while typing a value. If it should stay visible during entry, that is a separate decision: a small keyboard-accessory clock.
- **Logger position.** The Logger is pushed inside the Log tab, so the tab bar stays visible. All options live inside the existing `safeAreaInset`. Scroll content therefore insets above them, and nothing obscures set rows or the tab bar (see the "Long scrolled" captures).
- **Option A's idle state.** Option A's no-rest state shows the WORKOUT elapsed clock. That is exactly the Live Activity's no-rest rule (`WorkoutClockPresentation`), computed from `startedAt` minus accumulated pause. Options B and C show no clock until rest begins.

### Test plan
- **Unit tests.** Cover the presentation gate:
  - rest visible in `.workout`;
  - hidden with `finishConfirmationRequestedAt`, `finishedAt` or `submissionState`;
  - frozen values when paused;
  - countdown glyph and label;
  - workout-elapsed fallback for Option A.
- **Build 83 regression.** Extend the Not Yet restore test to assert the phone clock reappears with the same anchor.
- **UI tests.** Run in Sandbox with no Watch:
  - complete a set, and the stopwatch identifier appears;
  - uncheck it, and it disappears;
  - Finish Workout, and it is hidden; Not Yet brings it back;
  - a long workout scrolled to the end keeps the last set row above the bar.
- **Cross-surface.** Assert that the same `rest.id` and `startedAt` feed the Live Activity content state and the Watch projection.

---

## Item 2: guided iPhone → Watch handoff (GitHub #8)

### What exists today (pull-based protocol)
1. **Phone.** "Ready for Watch" is a toggle (`TrainingLoggerView.swift:889-919`) that calls `TrainingSessionAuthority.setReadyForWatch` (`:317-332`). That stamps `readyForWatchAt` **and clears `startedAt` / `rest` / pause**, so the draft stops being a live phone session.
2. **Publication.** `PhoneWatchWorkoutConnectivityBridge` publishes the prepared plan only through `updateApplicationContext` (`Networking/WatchWorkoutConnectivityBridge.swift:128-135`).
3. **Watch display.** The Watch shows `WatchWorkoutStartView` ("READY FOR WATCH" / Start Workout) only when the user opens the app. Start is enabled only when the connection state is `.reachable`.
4. **Watch start.** Start sends `.startPreparedWorkout` via `sendMessageData`. The phone authority's `startPreparedWorkout` (`:346-362`) sets `startedAt` and `watchStartedAt` and clears `readyForWatchAt`. The reply is `applied` / `unchanged`, and the Watch then begins and mirrors its `HKWorkoutSession`.

### What does not exist today
- `HKHealthStore.startWatchApp(with:completion:)`;
- any `WKApplicationDelegate` / `handle(_ workoutConfiguration:)` on the Watch;
- any phone-side `isPaired`, `isWatchAppInstalled` or `isReachable`, or `sessionWatchStateDidChange` / `sessionReachabilityDidChange` observation;
- any phone UI that observes Watch acknowledgment.

### What watchOS / WatchConnectivity actually permits

| Capability | Status |
|---|---|
| **Launch the Watch app from the phone** | **Possible but not guaranteed to be visible.** `HKHealthStore.startWatchApp(with: HKWorkoutConfiguration)` is the only sanctioned path. It asks watchOS to launch or wake the Watch app and delivers the configuration to `WKApplicationDelegate.handle(_ workoutConfiguration:)`, which the SwiftUI lifecycle reaches through `@WKApplicationDelegateAdaptor`. |
| **Wrist and lock state** | On an unlocked, on-wrist Watch the app normally comes to the front. Off-wrist, locked, asleep or out of range, it may launch without being visible, or the call fails. |
| **What the completion handler means** | `success` means the request was delivered. It does **not** prove the user saw the app. |
| **Starting a session on launch** | Apple's intended use is to start an `HKWorkoutSession` from that handler. Showing a pre-workout Start screen first is allowed, but HealthKit recording then begins at the tap. **Needs physical-device verification on the Ultra 3.** |
| **Launch through WatchConnectivity** | **Not possible.** `sendMessage` from the phone requires the Watch app to already be reachable (foreground, or running a workout session). `updateApplicationContext` and `transferUserInfo` never launch or foreground the Watch app. |
| **Paired vs reachable** | `isPaired && isWatchAppInstalled` is the right gate for *offering* the sheet. `isReachable` is normally **false** before the Watch app runs, so unreachable at offer time is expected and is not an error. |
| **Acknowledgment authority** | The phone's own `TrainingSessionAuthority` stamping `draft.watchStartedAt` is the authority. It happens only when the phone applies the Watch's `.startPreparedWorkout`, so a non-nil `watchStartedAt` is a truthful acknowledgment that the Watch started this plan. The sheet should observe that draft field, not a transport callback. |
| **Watch app not running / locked / asleep** | Nothing on the phone can wake the display or bypass the passcode. The truthful fallback is the instruction "open PhysiqueOS on your Watch and tap Start Workout". That path already works, because the prepared plan is in the application context. |
| **Stale session** | `preparedWorkout()` picks the newest `readyForWatchAt`. `currentProjection()` hides a prepared plan while another live session exists. The sheet must only offer when no other live session exists, otherwise Start is rejected (`sessionNotMutable`). |
| **Restore / relaunch** | The sheet state is not persisted. On relaunch the draft decides: `readyForWatchAt` set without `watchStartedAt` shows the waiting/fallback prompt again; `watchStartedAt` set shows the normal Logger. |

### Founder decision D-2a: which acknowledgment dismisses the sheet
Issue #8 says the sheet dismisses when the Watch acknowledges "receipt/readiness". This prompt says it dismisses on a truthful Watch acknowledgment. There are two possible signals:

| Signal | What it proves | Cost |
|---|---|---|
| **Readiness** | The Watch app is running and showing Start Workout for this exact session id and revision. | Needs a **new** Watch→phone command, e.g. `.preparedPresented(sessionId, revision)`, sent when `WatchWorkoutStartView` appears. The phone records it locally; it is not a second authority. After dismissal the phone Logger stays "prepared" (no `startedAt`) until the Watch's Start lands. |
| **Start** | The Watch's Start Workout was applied by the phone authority (`draft.watchStartedAt`). | **No new protocol.** The user taps Start on the Watch while the phone still shows the sheet. |

The boards' "Started on Watch" copy assumes Start. If Readiness is chosen, the copy becomes "Ready on your Watch — tap Start Workout there" and the sheet still auto-dismisses. Both are truthful. Readiness dismisses sooner; Start is simpler.

### Proposed flow for the selected option
1. Entering the active Logger with no completed sets, while `isPaired && isWatchAppInstalled` and no other live session exists, presents the prompt.
2. **Ready on Watch** calls the existing `setReadyForWatch(true)`, which publishes the prepared plan. It then calls `startWatchApp(with: traditionalStrengthTraining / indoor)`. The Watch adds `@WKApplicationDelegateAdaptor`. Its `handle(_:)` refreshes the application context and routes to `WatchWorkoutStartView`.
3. The phone shows **Waiting**. It always carries the truthful instruction, because foregrounding is not guaranteed.
4. **Unreachable** is shown on `startWatchApp` failure or after a bounded timeout (for example 20 s) with no acknowledgment.
5. When the Watch's Start is applied, `watchStartedAt` becomes non-nil. The phone shows **Started on Watch** briefly, auto-dismisses, and the existing authority continues unchanged.

### Expected conflicts and new pieces
- **Use without Watch after Ready.** `setReadyForWatch(false)` does **not** restore `startedAt`. Choosing **Use without Watch** from Waiting or Unreachable therefore needs a small authority operation that clears `readyForWatchAt` and re-stamps `startedAt` (an explicit phone start). From the initial offer it is simply "dismiss", because the session is already live on the phone.
- **"No nagging during the same workout"** needs a per-session decline marker that survives relaunch. Two candidates:
  - a local-only draft field, e.g. `watchHandoffDeclinedAt` (Codable optional, backward-decodable);
  - per-session UserDefaults.
- **Existing defect to fix together.** The Ready-card predicate (`TrainingLoggerView.swift:798`) does not exclude Watch-started sessions. After a Watch start, `readyForWatchAt` is nil and there are 0 sets, so the card reappears, and tapping it would clear `startedAt` on a Watch-owned session. Removing or replacing the card resolves this.
- **Watch idle copy.** The Watch idle copy "…then choose Ready for Watch." (`WatchWorkoutViews.swift:474`) should change to match the new phone wording.
- **Issue #8 edge cases this flow must cover:**
  - **Save & Leave or Cancel during the sheet:** Save & Leave keeps any `readyForWatchAt`; Cancel ends the session through `endSession`.
  - **No paired Watch:** the sheet is never shown.
  - **Already-ready or active Watch session:** offer nothing and show the status chip.
  - **Background/foreground during setup:** the state is re-derived from the draft on return.
  - **Reconnect after choosing phone-only:** the decline marker suppresses the prompt.
- **Separate Watch bug found.** `didReceiveApplicationContext` (`WatchWorkoutStore.swift:1547-1556`) drops the appearance slot, so a live appearance change reaches the Watch only on the next app install/launch.

### Replacing the large Ready for Watch card
Remove it. After the guided flow:
- **Watch-started session:** a quiet "On Watch" status chip in the navigation bar (shown on board B90-2c).
- **Use without Watch:** nothing; the normal Logger.
- **Changing your mind:** reopening the prompt before the first set can come from the same chip slot (an applewatch icon). This is optional and has no automatic re-prompt.

### Test plan
- **Unit tests.**
  - The prompt eligibility predicate: paired, installed, 0 sets, no other live session, not declined.
  - The decline marker survives a relaunch.
  - The new restore-phone-start operation.
  - `watchStartedAt` triggers the acknowledged state.
  - A stale prepared plan is never offered.
- **Bridge tests.** Use an injectable `WCSession` / HealthKit seam:
  - `startWatchApp` failure leads to Unreachable;
  - timeout leads to Unreachable;
  - acknowledgment leads to dismiss.
- **Watch unit test.** `handle(workoutConfiguration:)` routes to the Start screen with the received projection.
- **UI tests.** Sandbox with a stubbed Watch state: every prompt state, Use without Watch, and no re-prompt after relaunch.
- **Physical acceptance on the Ultra 3.** Unlocked on-wrist, locked, off-wrist, and app force-quit.

### Implement Items 1 and 2 together?
**Yes, as one lane with two commits.**
- Both change the same `TrainingLoggerView` footer and safe-area region and the pre-first-set workout step.
- "Use without Watch" is meant to land directly in the phone stopwatch experience.
- Shared UI tests (`LoggerParityCaptureUITests`) cover both.
- Item 1 has no dependency on Item 2 and can land first inside the lane.

---

## Item 3: Photo Briefing expanded viewer

### Source files
`Presentation/Briefings/PhotoBriefingSections.swift`:
- `PhotoComparisonInspection` (`:806`);
- `comparisonRequest` (`:204`);
- `PhotoComparisonViewer` (`:820-941`);
- `BriefingPairedZoomView` (`:946-1034`).

### Root cause of the blank columns
`BriefingPairedZoomView.Coordinator.layout()` (`:1002-1014`) makes each pane half the width but the **full height** of the viewer, with `scaleAspectFit` and an opaque `paneColor`. A 3:4 photo in a pane about 183 pt wide renders about 245 pt tall inside a pane about 650 pt tall, leaving about 200 pt of solid pane colour above and below each photo. The Previous/Current chips sit in that empty band.

### Interpretation
- `PhotoComparisonEntry.narrative` is the canonical persisted per-pose interpretation. The production mapper takes `headline`, falling back to the first `supportingObservation` (`ProductionBriefingMapper.swift:905-922`).
- It renders only inline today.
- This round adds `narrative` to `PhotoComparisonInspection` and passes `entry.narrative`. The current viewer ignores it, so Release behavior is unchanged.
- All three options render that persisted string and hard-code nothing.

### Design constraint (met by all options)
- **Stage sizing.** The stage is sized to the photos (height = pane width × the taller photo's height/width, capped at 60% of the screen). The zoom view then fills the stage with no letterbox bands.
- **Shared zoom kept.** The single `UIScrollView` keeps pinch zoom and synchronized pan, and clips to the stage.
- **Wider frames.** The "wider frame" row (1:1 crop of the flexed pose) shows the stage shrinking instead of growing bands.

### Expected conflicts
- **No model or Server change.** The only model change is the new optional `narrative` field.
- **Zoom view.** It is unchanged apart from frame sizing. Double-tap zoom-to-point still uses `scroll.bounds`, so it is correct within the stage.

### Test plan
- **New render test.** `PhotoComparisonViewer` has no render test today. Add a snapshot or ImageRenderer test for the selected option: Dark and Mineral, 3:4 and 1:1, with and without a narrative.
- **Unit tests.**
  - `comparisonRequest` passes `narrative`.
  - Stage height math: portrait fills, wide shrinks, and the cap holds.
- **UI test.** Open, pinch to 2×, both panes zoom, dismiss is blocked while zoomed, and Close works.
- **Physical acceptance.** Use real Founder photos on device. Real media is not used in this package.

---

## Item 4: Watch primary button vertical placement

### Which screen
- The described screen (Mineral, single primary button pinned near the bottom with excessive dead space) matches `WatchWorkoutStartView` ("READY FOR WATCH" / **Start Workout**, `WatchWorkoutViews.swift:580-604`). This is the pre-workout state the Ready for Watch flow lands on.
- The Idle screen (`:462-481`, **Refresh**) has the same geometry.
- The Founder screenshot itself was not available to this session, so this is inferred from the description.

### Shared component impact
- **Source:** the dead space comes from the shared `WatchPanelPage` (`:225-249`), where `Spacer(minLength: 6)` pins the actions to the bottom edge. It is used by Start, Idle and the Apple Health orphan prompt (two actions).
- **Unaffected:** Execution, Finish/Cancel confirmation, Finishing and Workout Saved own their layouts.
- **The change:** this round replaces the Spacer with a small `WatchPanelActionLayout` that places the actions at a fraction of the free space below the content:
  - Release: 1.0, which equals the bottom pin of Build 89;
  - Option A: 0.5;
  - Option B: 0.42.
- **Unchanged:** button size, style, 38 pt height, tap target, action, and scroll behavior when content overflows (the gap collapses to the original 18 pt and the page scrolls as before).

### Test plan
- **Unit test.** Layout math: fraction 0.5 centers within the free space; overflow collapses to the 18 pt minimum gap.
- **Watch UI test.** The Start button is hittable on 49 mm and 42 mm, Dark and Mineral, and the AX5 Dynamic Type overflow still scrolls.
- **Physical acceptance.** One glance on the Ultra 3.

---

## Release safety of this round
- **Seams compiled out of Release:** every seam is DEBUG-only:
  - `-physiqueos.b90.stopwatch`, `rest-seconds`, `workout-seconds`;
  - `-physiqueos.b90.handoff`, `handoff-state`;
  - `-physiqueos.b90.photo-viewer`, `photo-aspect`;
  - `-watchPanelActionPlacement`.

  Release renders Build 89 behavior.
- **Non-DEBUG changes:**
  - `PhotoComparisonInspection.narrative`: passed through, not rendered by the Release viewer.
  - `WatchPanelActionLayout`: Release fraction 1.0, the same bottom-pinned geometry.
- **Verification:** Release compile results and the seam-string scan are in `README.md`.
