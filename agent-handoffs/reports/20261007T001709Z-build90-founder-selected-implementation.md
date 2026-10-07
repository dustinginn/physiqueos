# Build 90 Founder-selected Native changes: implementation candidate ready

**Task:** `build90-founder-selected-implementation-20261006`. The prompt is `agent-handoffs/inbox/prompts/20261006T231500Z-claude-build90-founder-selected-implementation.md`, at commit `7185e7c0`.

**Status:** Build 90 Founder-selected Native changes are ready for integration. This is a report-only publication: `latest.json` is unchanged, and Build 89 remains the release authority.

## Authority
| Item | Value |
|---|---|
| **Candidate SHA** | `a14eb4c45ee602025cc7d666c96956b7972beac1` |
| Branch | `claude/native-build90-founder-selected-implementation-20261006` (pushed, verified) |
| Implementation commit | `18daeab1` |
| Proof package commit | `a14eb4c4` |
| Base | Build 89 `51399425`, plus design package `3d7c54ab` |
| Production Server | `b7eb1e39` / deployment `6fa4e887`, unchanged; read-only check, health live 200 |

The proof package is `agent-handoffs/artifacts/build90-founder-selected-implementation-20261006/` (README, boards I1–I4, captures). It uses synthetic photo media only.

## Founder selections implemented
| Item | Selection | What shipped |
|---|---|---|
| **B90-1** | **Option A** | <ul><li>The canonical clock is docked beside Finish Workout.</li><li>**No rest:** the WORKOUT elapsed clock.</li><li>**Active rest:** the canonical rest stopwatch or countdown, plus a restrained **End**. End is the existing `endRest`.</li><li>**No phone Pause/Resume.**</li><li>**Finish confirmation:** the clock is hidden (Build 83 rule).</li></ul> |
| **B90-2** | **Option B** | <ul><li>A centered handoff card over the dimmed Logger.</li><li>**Ready:** `setReadyForWatch` plus `HKHealthStore.startWatchApp`. A delivered request is never treated as an acknowledgment.</li><li>**Waiting:** always shows the open-PhysiqueOS-and-tap-Start-Workout instruction.</li><li>**Dismissal:** only on the authority's `watchStartedAt`.</li><li>**Use without Watch:** first-class, persisted, no re-prompt during the workout.</li><li>**After the Watch starts:** a quiet On Watch chip.</li><li>**The Ready for Watch card is removed.**</li></ul> |
| **B90-3** | **Option B** | <ul><li>A centered comparison group: a bounded stage sized to the photos, with labels on the photos.</li><li>The canonical narrative in a card below the pair.</li><li>Synchronized pinch zoom and pan are unchanged.</li></ul> |
| **B90-4** | **Option A** | The shared `WatchPanelPage` actions are true-centered: Start Workout, Idle and the orphan prompt. Execution is unchanged. |

**Option removal:** all unselected options and every option-selection seam are removed. No runtime picker remains.

## Architecture changes
- **One timer authority.**
  - The clock is a pure presentation (`TrainingLoggerClockPresentation`) of `draft.rest` and the start/pause anchors.
  - **End Rest:** `TrainingLoggerViewModel.endRest(restId:)` calls `TrainingSessionAuthority.endRest`. It is named by rest id, so a stale tap is refused and a repeat is a no-op. While the Watch has the session paused, End Rest is refused.
  - **Watch and Live Activity:** they follow through the existing authority observers.
- **One session authority for the handoff.**
  - **New authority operation:** `declineWatchHandoff`. It records `watchHandoffDeclinedAt` (local, optional, backward-decodable). If the plan was already prepared, it withdraws it and restarts the session on the phone.
  - **New presentation model:** `TrainingWatchHandoffModel`, with phases offer, waiting, unreachable (request not delivered, or a 25 s timeout) and acknowledged, plus a short display before dismissal.
- **Phone-side Watch observation.**
  - `WatchCompanionAvailability` on `AppEnvironment`, fed by WatchConnectivity activation, watch-state and reachability changes.
  - Offered when the Watch is paired and PhysiqueOS is installed. It is not gated on reachability, and not offered while another live session exists.
- **Watch side.**
  - `@WKApplicationDelegateAdaptor` `handle(_ workoutConfiguration:)` takes the newest context and refreshes the projection, so Start Workout is on screen.
  - Starting remains the user's tap on the Watch.
  - Foregrounding a locked, asleep, off-wrist or out-of-range Watch is not guaranteed, and the copy never claims it happened.
- **Photo stage geometry.** `PhotoComparisonStageLayout`: height = pane width × the taller photo's height/width, capped at 60% of the screen. `PhotoComparisonInspection.narrative` is passed through.
- **Watch centering.** `WatchPanelActionLayout` centers the actions in the free space. The original 18 pt minimum gap and the overflow scrolling are preserved.

## Defect dispositions
| Defect | Disposition |
|---|---|
| **Ready-card start-clearing** (pre-existing) | **Fixed.** The card is removed, and `setReadyForWatch` now refuses sessions with `watchStartedAt` or `watchHealthStartedAt`. Regression test added. |
| **Watch appearance slot** | **Fixed.** It sits on the same live context-delivery path the handoff uses, and the fix is one forwarded slot. All three slots are now forwarded. Regression test added. |
| **New finding:** `TrainingLoggerDraft.activeLiveSession` could not parse the fractional-second `startedAt` the authority writes for Watch starts. Watch-started workouts were not Log-tab routable and did not block a second prepared start. The router and Live Activity were unaffected (`liveActivitySubject`). | **Fixed** with a one-line parser change. Regression test added. |

## Files changed (`ios/`, 14 files)
- **App:**
  - `App/AppEnvironment.swift`
  - `Contracts/TrainingLoggerReadModel.swift`
  - `Networking/TrainingSessionAuthority.swift`
  - `Networking/WatchWorkoutConnectivityBridge.swift`
  - `Presentation/Briefings/PhotoBriefingSections.swift`
  - `Presentation/TrainingLogger/TrainingLoggerView.swift`
  - `Presentation/TrainingLogger/TrainingLoggerViewModel.swift`
- **Watch:**
  - `PhysiqueOSWatchApp.swift`
  - `WatchWorkoutStore.swift`
  - `WatchWorkoutViews.swift`
- **Tests:**
  - `PhysiqueOSTests/TrainingSessionAuthorityTests.swift`
  - `PhysiqueOSTests/BriefingV3PresentationTests.swift`
  - `PhysiqueOSUITests/TrainingAcceptanceUITests.swift`
  - `PhysiqueOSWatchTests/WatchWorkoutFinishStateTests.swift`
- **Not changed:** no pbxproj or generator change.

## Validation
| Gate | Result |
|---|---|
| Full PhysiqueOSTests | **2149 / 0** (1 designed skip) |
| Focused | 342 tests. The first run surfaced the fractional-start defect plus 1 test-setup error; after fixes, TrainingSessionAuthorityTests is 101/0, and the full suite is green. |
| Watch unit | **59 / 0** |
| Watch UI, 49 mm and 42 mm | 6/7 each. The only failure is the pre-existing `testFinalSetFinishShowsConfirmation…` WCSession harness limitation (same on Builds 88 and 89). |
| iPhone UI (`Build90FounderSelectedUITests` 7/7, `TrainingAcceptanceUITests`, `LoggerParityCaptureUITests`) | **35 / 0** |
| Release, generic iOS (app + embedded Watch + Live Activity/Widget) | **SUCCEEDED**; `verify_release_configuration.py` OK |
| Release seam scan | 0 hits in all three binaries. Positive controls: production strings present (3); Debug fixtures present (4). |
| Other | `git diff --check` clean; generator unchanged |

**DEBUG fixtures kept:** `-physiqueos.watch-review.paired`, `launch` and `watch-start` (the simulator has no Watch; the fixture routes a real `.startPreparedWorkout` through the authority), and `-physiqueos.briefing-review.photo-aspect`. All are compiled out of Release.

**Storage after:** this lane's DerivedData and Release products were removed after results were recorded. The shared disk has about 22 GiB free. No worktrees or archives were touched.

## Expected conflicts with Claude B
- **Checked against:** `origin/claude/native-build90-remaining-redesign-20261006` at `8c3172e1` (Energy + Recovery/Sleep).
- **Result:** `git merge-tree` is **clean**.
- **Shared file:** only `ios/PhysiqueOS/App/AppEnvironment.swift`, in disjoint hunks. Claude A adds `watchCompanion` and `watchAppLauncher` next to `pendingTrainingLoggerResumeDraftId`.
- **Untouched by this lane:** Energy, Recovery/Sleep, DEXA, Server, progression and access tooling.

## Physical-device acceptance checklist
The full list is in the package README. In summary:
1. **Phone-only:** WORKOUT clock, then REST with End, then WORKOUT again; background continuity.
2. **Synchronization:** phone, Live Activity and Watch show the same rest, and End clears all three.
3. **Finish:** Finish hides the clock; Back restores the same rest.
4. **Handoff, unlocked Watch:** Ready brings PhysiqueOS forward on the Watch; Start auto-dismisses the phone card and shows On Watch.
5. **Handoff, locked or off-wrist Watch:** a truthful Waiting state or Not reachable; tapping Start manually on the Watch dismisses the card.
6. **Use without Watch:** no re-prompt after leaving, relaunching or reconnecting.
7. **Photo viewer on real media:** a bounded centered stage, labels on the photos, the interpretation card below, synchronized zoom and pan, swipe blocked while zoomed, Close works.
8. **Watch centering:** on the Ultra 3, Mineral and Dark.
9. **Watch appearance:** a phone-side Watch appearance change applies live.

## Not done (by design)
No Build 90 bump, no archive or TestFlight upload, no latest-release change, no Server deploy, no production mutation.
