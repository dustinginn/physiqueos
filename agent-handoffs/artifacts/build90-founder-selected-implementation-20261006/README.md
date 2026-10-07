# Build 90 Founder-selected Native changes: implementation candidate

**Status: Build 90 Founder-selected Native changes are ready for integration (Claude A).** The build number is not bumped, nothing was archived or uploaded to TestFlight, the Server was not touched, and production was not mutated.

- **Branch:** `claude/native-build90-founder-selected-implementation-20261006`.
- **Base:** Build 89 `51399425`, plus the design package `3d7c54ab`. That package adds agent-handoff docs plus the DEBUG review seams; the seams are all replaced here.
- **Implementation commit:** `18daeab1`. The candidate SHA is in the main report.

## Founder selections implemented
| Item | Selection | What shipped |
|---|---|---|
| **B90-1** iPhone rest stopwatch | **A**: docked tile beside Finish Workout, plus End Rest, no phone Pause/Resume | <ul><li>**No rest:** WORKOUT elapsed, the Live Activity rule.</li><li>**Resting:** the canonical rest stopwatch or countdown plus a restrained **End** button.</li><li>**Finish confirmation:** the clock is hidden (Build 83).</li></ul> |
| **B90-2** guided Watch handoff | **B**: centered card over the dimmed Logger; dismissed only by `watchStartedAt` | <ul><li>**States:** offer, waiting (always shows the open-and-tap instruction), Watch started (auto-dismiss), and the not-reachable fallback.</li><li>**Use without Watch:** first-class, never re-prompted.</li><li>**After the Watch starts:** a quiet On Watch chip.</li><li>**The Ready for Watch card is removed.**</li></ul> |
| **B90-3** photo viewer | **B**: centered comparison group | <ul><li>A bounded stage sized to the photos, with labels on the photos.</li><li>The canonical narrative in a card below the pair.</li><li>Synchronized zoom and pan are unchanged.</li></ul> |
| **B90-4** Watch button | **A**: true centered | `WatchPanelPage` centers its actions in the free space; this covers Start Workout, Idle and the orphan prompt. |

All unselected options, and every option-selection seam (`-physiqueos.b90.*`, `-watchPanelActionPlacement`), are deleted. There is no runtime option picker.

## Architecture
- **One timer authority.**
  - The clock (`TrainingLoggerClockPresentation`) is derived only from `draft.rest` and the start/pause anchors. Those are the same values that feed `TrainingSessionLiveProjection`, the Watch projection and the Live Activity.
  - It renders with `Text(timerInterval:)`, exactly as the Live Activity does. Nothing ticks.
  - **End Rest** calls the existing `TrainingSessionAuthority.endRest(sessionId:restId:)` through `TrainingLoggerViewModel.endRest(restId:)`:
    - a repeated tap is a no-op;
    - a stale tap that names a replaced rest is refused;
    - while the Watch has the session paused, the authority refuses it and End is hidden.
  - The Watch and the Live Activity update through the authority's existing change observers.
- **One session authority for the handoff.** `TrainingWatchHandoffModel` is presentation only:
  - **Ready:** calls `setReadyForWatch(true)`, then `HKHealthStore.startWatchApp` through `WatchAppLaunching`.
  - **Use without Watch:** calls the new `TrainingSessionAuthority.declineWatchHandoff`. That records `watchHandoffDeclinedAt`, a local-only optional field that stays backward-decodable. If the plan had already been prepared, it also withdraws the plan and restarts the session on the phone.
  - **Acknowledgment:** comes only from the authority's `watchStartedAt`, stamped when the phone applies the Watch's Start Workout. A launch request that was merely delivered keeps the card in Waiting.
  - **Fallback:** a request that was not delivered, or no Start within 25 s, shows the fallback.
- **Truthful Watch observation.**
  - `WatchCompanionAvailability`, a new property on `AppEnvironment`, is fed by WatchConnectivity activation, `sessionWatchStateDidChange` and `sessionReachabilityDidChange`.
  - The modal is offered when the Watch is paired and PhysiqueOS is installed. It is never gated on reachability, which is normally false before the Watch app runs.
  - The modal is not offered when another live session exists.
- **Watch launch path.**
  - `PhysiqueOSWatchAppDelegate`, attached through `@WKApplicationDelegateAdaptor`, receives `handle(_ workoutConfiguration:)`.
  - It takes the newest application context and asks the phone for a fresh projection, so Start Workout is on screen. Starting still requires the user to tap Start on the Watch.
  - **What watchOS does not guarantee:** foregrounding a locked, asleep, off-wrist or out-of-range Watch. The copy never claims a launch succeeded.
- **Photo stage.** `PhotoComparisonStageLayout` sets stage height to pane width × the taller photo's height/width, capped at 60% of the screen. `PhotoComparisonInspection.narrative` carries `entry.narrative`.
- **Watch centering.** `WatchPanelActionLayout.actionsOriginY` centers the actions. The original 18 pt minimum gap and the overflow scrolling are unchanged.

## Defects
| Defect | Disposition |
|---|---|
| **Ready card cleared `startedAt`** (pre-existing, Build 89): the card's predicate did not exclude Watch-started sessions. | **Fixed twice over.** The card is removed, and `setReadyForWatch` now refuses any session with `watchStartedAt` or `watchHealthStartedAt`. Regression test: `testB90ReadyForWatchIsRefusedForAWatchStartedSessionAndNeverClearsItsStart`. |
| **Watch appearance slot dropped** on a live application-context delivery. | **Fixed.** The handoff relies on the same delivery path, and the fix is one forwarded slot. `forwardedApplicationContextSlots` now carries the projection, totals and appearance slots. Regression test: `testLiveApplicationContextDeliveryForwardsTheAppearanceSlot`. |
| **New finding:** `TrainingLoggerDraft.activeLiveSession` parsed `startedAt` without fractional seconds, but the authority stamps Watch starts with them. A Watch-started workout was therefore not Log-tab routable and did not block a second prepared start. The router and Live Activity were unaffected; they use `liveActivitySubject`. | **Fixed** (one line: `TrainingSessionClock.date(from:)`). The Use-without-Watch restart depends on it. Regression test: `testB90WatchStartedSessionWithFractionalStartIsTheActiveLiveSession`. |

## Validation (lane simulators: iPhone 17 Pro, Ultra 3 49 mm, Series 12 42 mm)
| Gate | Result |
|---|---|
| Full PhysiqueOSTests | **2149 tests, 0 failures** (1 designed skip) |
| Focused (authority, Logger, live projection, Build 83, rest preference, Briefing V3, Photo) | 342 tests. The first run found 1 real defect (above) plus 1 test-setup error; after fixes, TrainingSessionAuthorityTests is 101/0, and the full suite is green. |
| Watch unit | **59 / 0** |
| Watch UI, 49 mm and 42 mm | 6/7 each. The single failure is the pre-existing `testFinalSetFinishShowsConfirmation…` WCSession harness limitation (also fails on Builds 88 and 89). |
| iPhone UI (`Build90FounderSelectedUITests` 7, `TrainingAcceptanceUITests`, `LoggerParityCaptureUITests`) | **35 / 0** |
| Release, generic iOS (app + embedded Watch + Live Activity/Widget) | **BUILD SUCCEEDED**; `verify_release_configuration.py` OK |
| Release seam scan (`physiqueos.b90`, `watchPanelActionPlacement`, `watch-review`, `photo-aspect`, review types) | 0 hits in the app, Watch and Live Activity binaries. Positive controls: production handoff strings are present in Release (3); the review fixtures are present in the Debug dylib (4). |
| Generator / pbxproj | No change |
| `git diff --check` | Clean |

**DEBUG fixtures kept:** a few UI-test fixtures remain, all compiled out of Release.
- `-physiqueos.watch-review.paired`, `launch delivered|failed`, `watch-start <s>`: the simulator has no Watch. The fixture's "Watch Start" routes a real `.startPreparedWorkout` through the authority.
- `-physiqueos.briefing-review.photo-aspect`: tests the wider frame.

## Boards (implementation proof)
- `boards/I1-logger-clock.png`
- `boards/I2-watch-handoff.png`
- `boards/I3-photo-viewer.png`
- `boards/I4-watch-centered.png`

Raw captures are in `captures/`. All photos are safe synthetic review media.

## Expected conflicts with Claude B (Energy + Recovery)
- **Checked against:** `origin/claude/native-build90-remaining-redesign-20261006` at `8c3172e1`.
- **Result:** `git merge-tree` is **clean**.
- **Shared file:** only `ios/PhysiqueOS/App/AppEnvironment.swift`, in disjoint hunks. Claude A adds two properties next to `pendingTrainingLoggerResumeDraftId`.
- **Untouched by this lane:** Energy, Recovery/Sleep, DEXA, Server, progression and access tooling.

## Physical-device acceptance checklist (iPhone + Ultra 3)
1. **Phone-only rest timing.** With no Watch, start a workout. You should see WORKOUT counting beside Finish Workout and no Watch prompt. Complete a set: REST counts with **End**. Tap End: back to WORKOUT. Complete another set, background the app for 1 minute, and return: the rest time is continuous.
2. **Synchronization.** With the Live Activity visible (and the Watch, if used), complete a set: the same rest time shows on the phone, the Live Activity and the Watch. Tap End on the phone: rest disappears on all of them.
3. **Finish.** Tap Finish Workout: the clock disappears. Go Back to set entry: the same rest returns.
4. **Handoff, happy path.** With the Watch on-wrist and unlocked, enter the Logger before the first set. The centered card appears. Tap Ready on Watch: PhysiqueOS should come forward on the Watch with Start Workout. Tap Start: the phone shows "Started on Watch", dismisses itself, and shows the On Watch chip.
5. **Handoff with the Watch locked or off-wrist.** Tap Ready: the phone stays on Waiting with the instruction, or shows Watch not reachable. It never claims success. Open PhysiqueOS on the Watch and tap Start: the phone dismisses.
6. **Use without Watch.** Tap it: the card closes immediately. Leave and return, relaunch, and reconnect the Watch: there is no re-prompt for this workout.
7. **Photo viewer.** On a real Photo Briefing:
   - the pair is a bounded, centered stage with no blank columns;
   - Previous/Current and the dates sit on the photos;
   - the real interpretation shows in a card below;
   - pinch and pan move both photos together;
   - swipe down is blocked while zoomed;
   - Close works.

   Check a Front/Back relaxed pose and a flexed pose.
8. **Watch centering.** On the Ultra 3, Mineral and Dark: Start Workout, Idle (Refresh) and the Apple Health orphan prompt have their button centered. Execution is unchanged.
9. **Watch appearance.** Change the Watch appearance on the phone while the Watch app is open. It should switch without relaunching the Watch app (the appearance-slot fix).
