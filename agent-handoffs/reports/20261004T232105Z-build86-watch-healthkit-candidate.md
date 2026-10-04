# Build 86 candidate — Watch HealthKit for phone-started workouts, Watch latency, Foam Rolling pilot

- Generated (UTC): `2026-10-04T23:21:05Z`
- Agent: Claude (existing Remote Control lane, High reasoning)
- Status: **CANDIDATE IMPLEMENTED / TESTED / COMPILED — NOT UPLOADED — AWAITING FOUNDER + CHATGPT REVIEW**
- Governing prompt: `agent-handoffs/inbox/prompts/20261004T210500Z-post-workout-watch-healthkit-next-build-claude.md` at `80c5fd558ff83f91eafad568616388909067cdcf`
- Prior audit: `agent-handoffs/reports/20261004T202256Z-live-workout-healthkit-watch-audit.md` (`6682a426`)
- Native branch: `claude/native-watch-healthkit-build86-20261004`
- Candidate head: ``4f78fce663fb16c3cc6930b3b8e576a328defcbe`` (Build 86)

No TestFlight upload, App Store Connect or browser login, production mutation, deployment or Server change was made.

## 1. Authority and commits

| Item | Exact value |
|---|---|
| Base | Foam Rolling pilot `b65deb00098713d824f14064e0362726997b5991`, a direct child of Build 85 `b8ee8690`. It is the only Native work after Build 85 on any `origin` branch. |
| Production Server (read-only `/health/live`) | `physiqueos-3c0f4aef-20261003`, unchanged. No Server change is needed. |
| Last uploaded build | `85` (`~/.physiqueos-release/state/last-uploaded-build`) |

Commits on top of the base:

1. `a5646c8b` build: pin the Foam Rolling UI test in the project generator. The pilot hand-added `FoamRollingPriorityDetailUITests.swift` (`0x1C00/0x1C01`) to `project.pbxproj` only, so regeneration silently dropped it. Regeneration is now byte-identical.
2. `d43ad7cd` feat(watch): HealthKit for phone-started workouts, truthful Health status, non-blocking refresh, latency trace, tests.
3. ``4f78fce6`` chore(ios): Build 86 (generator `APP_BUILD_NUMBER` plus the `TrainingLoggerTests` pin).

The Foam Rolling pilot is integrated exactly as accepted. Its source is unchanged; only the generator pin was added.

## 2. Today's workout: reconciliation findings (Part A, read-only, Server `3c0f4aef`)

Today's evidence: two Apple Stair Stepper workouts, one late-started Apple Traditional Strength Training workout, and one PhysiqueOS structured Logger session (phone-started, no PhysiqueOS HealthKit workout).

- **Stair Steppers.** They stay two independent Cardio workouts (HK type 44 → Cardio `stair_climbing`).
  - Ids are per-HK-UUID.
  - The strength matcher skips Cardio. The duplicate check only annotates `possibleDuplicateOf` and never merges.
- **Late Apple strength workout → no auto-link.**
  - The Logger-window rule cannot apply because the Logger starts before the Apple workout.
  - The general scorer gives overlap 35 plus 20 if the Apple end is within 5 min of the Logger end.
  - Within 5 min, it scores **55 = `possible_match`**, which creates one Pending Workout Match review.
  - Otherwise it scores **35 = `no_match`**: a standalone canonical Strength workout with no review.
  - **Observed by the Founder on device (Oct 4, 4:15 PM).** One Pending Workout Match: Apple Traditional Strength Training 1:28–1:48 PM vs Logger session 1 12:31–1:47 PM, "55% match · Time and telemetry". This exactly confirms the prediction. No production read was made by this lane.
  - Auto-confirm is impossible three ways: policy `linkAutoConfirm=false`, the gate refusing `assessment_not_confident`, and the hard-coded `HEALTHKIT_STRENGTH_LINK_AUTO_CONFIRM=false`.
- **No duplicate or overwrite.** The canonical workout is Apple telemetry only, with no sets. Links are separate one-to-one claims. Reassessment never touches the Logger session.
- **Energy.** Daily active energy is Apple's move total. Workout energy is descriptive and never added to it, so there is no double count. Stair Steppers are itemised as workout calories; the strength workout's energy is itemised only after a confirmed link.
- **Trusted correlation does not match.** The Apple workout has no `physiqueOSSessionId`/UUID, its bundle is not allowlisted, and today is before the `2026-10-05T07:00Z` activation.
  - Correction to my earlier audit: the 120 s rule is **containment** within `[structured start − 120 s, finish + 120 s]`, not start alignment.
- **Founder action.** **Use Logger session 1** is legitimate (same physical workout; a one-to-one link with no change to sets). The trade-off is the Server presentation defect below: the session will likely display the late 1:28–1:48 window and Apple calories. Leaving it pending until that Server fix is also safe. It is a Founder choice; this lane changed nothing.
- **Presentation defect (Server; reported, not fixed).** Even an *unconfirmed* candidate replaces the Logger session's displayed start/end/duration/calories with the Apple window, and that appears to persist after a Founder "No match". It is recorded in the ledger. No production record was touched.

## 3. HealthKit start: before / after

**Before (Build 85).** Only Ready for Watch → Watch Start Workout started an `HKWorkoutSession`. A phone-started session showed the full Watch workout with no HealthKit, no affordance to start one, and a false `HEALTH ON`.

**After (Build 86 candidate).**

- **Automatic start.** When the Watch shows an active or paused structured session, it starts its HealthKit workout automatically once all of these hold:
  - the phone has no Watch Health start recorded for the session (`watchHealthStartedAt == nil`);
  - no workout is live, stored (running but not yet recovered) or saved for it;
  - no start is in flight, and there has been no prior automatic attempt in this process;
  - the PhysiqueOS Watch app is in front;
  - relaunch recovery has finished.
  - A paused session starts and then pauses its workout.
- **Report to the phone.** The Watch sends one new command, `reportHealthStarted`. It is identified by session, not revision, and is idempotent.
  - The phone stamps a **separate** `watchHealthStartedAt`.
  - The Finish then expects exactly one Health leg (`watchHealthSaveState = .pending`), including a start that is reported after the finish stamp.
  - `watchStartedAt`, the structured start and the trusted envelope are **unchanged**.
  - The Native registry treats an auto-started Watch workout like a Watch-started one (same predicate, same 120 s containment, same `effectiveAt`, exact UUID required). Trust is **not widened**.
- **Exactly once across replay, reconnect and relaunch.** The phone-known start, the stored correlation and the single-flight start all prevent a second workout.
  - If the phone knows of a start but this Watch has nothing recording, it shows `NOT RECORDING TO HEALTH` with an explicit **Record to Health**, never a silent second workout.
- **Failure.** It shows `HEALTH START FAILED` with **Retry Health Start**, and is never retried automatically in a loop.
  - A half-started controller start is now torn down; previously it would block every retry.
- **Cancel during start** discards the workout and reports nothing.
- **Pause sync.** Phone-originated pause/resume now pause/resume the Watch workout (previously only Watch-originated ones did).
- **Watch-started flow** (Ready for Watch → Start Workout) is preserved.

**Limitation.** Auto-start needs the PhysiqueOS Watch app open and in front, as it was today. The phone does not launch the Watch app (`startWatchApp(with:)` is not used); that would be a separate decision.

## 4. Truthful Health status and metrics

- The authority warning shows `IPHONE UNAVAILABLE · HEALTH ON` only while recording, and `… · HEALTH OFF` otherwise.
- The execution header shows `STARTING HEALTH…`, `NOT RECORDING TO HEALTH` or `HEALTH START FAILED` while sets are being executed. While recording it shows the workout title.
- On Workout Metrics, the title slot shows the same status when not recording. Heart rate and energy come only from the live builder ("—" otherwise, never daily values). TIME stays the phone's structured clock.
- On the idle "Phone unavailable" screen, the text claims Apple Health keeps recording only when it actually is.

## 5. Watch latency: before / after

**Before.** Every display activation, reachability-true transition and activation completion sent a read-only refresh through the single-flight mutation gate. That disabled Complete Set until the phone replied. A stale Complete Set required a second tap.

**After.**

- The refresh has its own lane: one in flight, a 12 s watchdog, and a failure that never manufactures a warning. It never sets `isMutationPending`.
- Complete Set enablement is `projection.canCompleteSet && !isMutationPending && reachable`.
- Mutations still serialize through the gate with unchanged retry/backoff.
- A Complete Set refused only as **stale** is re-sent **once**, with a new mutation id, and only if the refreshed state still targets the exact tapped set. If the phone already completed it (target moved), nothing is re-sent. Exactly-once holds because the router applies nothing on stale.
- An ongoing HealthKit workout should also keep the Watch app in front and running. This is the likely amplifier from the audit and needs physical confirmation.

**Instrumentation (no content, no identifiers).**

- The Watch logs subsystem `com.physiqueos.native.dev.watchkitapp`, category `WatchLatency`: display active/inactive, reachable/unreachable, refresh issued/acknowledged/failed, context/ack applied, command issued/acknowledged, Complete Set enabled/disabled, Health start requested/started/failed. Each entry carries milliseconds since activation.
- The phone logs subsystem `com.physiqueos.native.dev`, category `WatchBridge`: per command, kind, outcome and main-actor routing ms.
- To read them: Console.app on the paired iPhone/Watch, or a sysdiagnose.

## 6. Immediate phone → Watch push (Part E): DEFERRED

It was not included. There is no physical measurement yet, and the 10–15 ft symptom is consistent with the interactive (Bluetooth) lane losing reachability. In that state `sendMessage` cannot deliver, so a message push could not help. Application context remains the only phone-originated push. Measure D1–D4 with the new trace on device first, especially at 10–15 ft, then decide.

## 7. Tests

| Suite | Result |
|---|---|
| Watch unit (`PhysiqueOSWatchTests`) | **47 passed, 0 failed** (34 existing + 13 new) |
| iOS unit, full target (`PhysiqueOSTests`) | **1,998 executed, 1 failed, 1 skipped.** The only failure is `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` (line 616, a clock-sensitive "Paused" label). It **fails identically at the untouched base `b65deb00`**, so it is pre-existing and unrelated. Re-run at the Build 86 head: 495 focused tests (Training/Watch/Build 83 finish/Priority/FounderServerAPI/Completion/TrainingLogger incl. the `86` version pin) passed, 0 failed. |
| Foam Rolling UI (`FoamRollingPriorityDetailUITests`) | **2 passed, 0 failed** (Dark + Mineral Light) at the Build 86 head |
| Watch UI (`WatchWorkoutNavigationUITests`) | **6 passed, 1 failed.** `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` (line 89) **fails identically at the untouched base `b65deb00`**, so it is pre-existing. In the DEBUG fixture the WCSession is never activated, so the Finish tap marks the phone unavailable and Not Yet returns to "Retry iPhone" instead of Finish (Build 85 authority-warning behavior). Recommended as a separate test-fixture fix, not changed here. |

New deterministic coverage, numbered as in the prompt:

1. `testPhoneStartedActiveSessionStartsHealthExactlyOnceAndReportsTheStart`
2. `testReplayReconnectAndRelaunchNeverStartASecondHealthWorkout` (plus the policy table)
3. `testPausedSessionStartsHealthPausedAndFollowsPhonePauseAndResume`
4. `testTerminalCancelledAndNonExecutingSessionsNeverStartHealth` and `testCancelArrivingDuringAutomaticStartDiscardsTheWorkoutAndReportsNothing`
5. `testHealthStartFailureIsVisibleDoesNotLoopAndExplicitRetryStartsOnce`
6. `testWatchHealthStartIsRecordedOnceAndNeverMovesTheStructuredStart` and `testWatchStartedSessionAlreadyOwnsItsHealthWorkout`
7. `testPhoneFinishAfterReportedHealthStartExpectsExactlyOneHealthSave`, `testHealthStartReportedAfterTheFinishStampStillExpectsTheHealthLeg` and `testFinishOfAnAutoStartedWorkoutSavesAndReportsExactlyOnce`
8. `testHealthStatusMatrixIsTruthful`
9. `testWorkoutMetricsComeOnlyFromTheLiveHealthWorkout`
10. `testReadOnlyRefreshNeverDisablesCompleteSet`
11. `testCompleteSetDuringRefreshIsSentOnceAndSettlesExactlyOnce`
12. `testStaleCompleteSetIsResentOnceForTheSameSetAndNeverForAMovedTarget`
13. Not applicable (push deferred).
14. The Foam Rolling pilot unit suites are included in the full iOS run; its UI suite is in the table above.
15. `testTodaysWorkoutSetNeverWidensTrustedCorrelation`: the late Apple strength workout and both Stair Steppers are never trusted, the 120 s boundary is unchanged at exactly ±120 s, nothing is trusted pre-activation, and the envelope is the structured start.

Plus `testLatencyTraceMeasuresActivationToCompleteSetEnabled`.

Test hygiene: the Watch store tests now use a fake Health recorder, so no test touches HealthKit. The two reducer tests that keep the real controller run with the display inactive. Auto-start is also disabled for DEBUG fixture captures.

## 8. Release build

`xcodebuild build -scheme PhysiqueOS -configuration Release -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO` gives **BUILD SUCCEEDED** at `4f78fce6`.

- The product contains the iPhone app, the embedded `PhysiqueOSWatch.app` and `PhysiqueOSLiveActivity.appex`, all `CFBundleVersion 86`.
- Watch `WKBackgroundModes = workout-processing`; Health usage strings and `ITSAppUsesNonExemptEncryption = false` are present.
- The project generator regenerates byte-identically. The bump changes exactly 8 `CURRENT_PROJECT_VERSION` lines.
- No archive was created, nothing was signed or uploaded, and the release receipt state is untouched (`last-uploaded-build` = 85).

## 9. Physical-device acceptance (required before upload approval is meaningful)

1. Start a normal structured strength workout on iPhone (no Ready for Watch). Open PhysiqueOS on the Watch: it shows `STARTING HEALTH…`, then the title. The workout (running-figure) indicator appears exactly once.
2. HR, Active and Total Calories populate on Workout Metrics within about a minute.
3. Health text is truthful in every state, and HEALTH ON appears only while recording.
4. Complete Set responsiveness at arm's length and specifically at 10–15 ft: wrist down/up repeatedly. Capture `WatchLatency`/`WatchBridge` logs (Console.app or sysdiagnose) to separate reachability from app delay.
5. Complete or edit a set on the iPhone; the Watch follows. A Watch tap racing it is recorded once.
6. Pause/resume from both iPhone and Watch; the Watch workout follows.
7. Finish: exactly one Apple Health Traditional Strength Training workout from PhysiqueOS, and no duplicate strength workout. The finish shows the Apple Health leg saved.
8. Relaunch the Watch app mid-workout: no second workout, recording continues.
9. Foam Rolling Priority Detail on a physical iPhone: content, completion, Skip, and setup → Recovery Support route.
10. Dark appearance now. Mineral Light is the pilot's DEBUG capture path only, until the global theme architecture lands.

## 10. Ledger

- "Apple Watch Workout — phone-started session never records HealthKit / false HEALTH ON": **FIXED IN BUILD 86 CANDIDATE**, close after physical acceptance.
- "Apple Watch Logger — activation refresh disables Complete Set": **FIXED IN BUILD 86 CANDIDATE**, close after physical acceptance.
- Timed-set projection, Settings/theme/Evidence/design deltas: unchanged.
- New: Server Workout presentation applies an unconfirmed (and possibly Founder-rejected) HealthKit candidate's window to the Logger session. LIKELY SHIPPING DEFECT, Server, OPEN.

## 11. Parallel work not integrated (decision needed)

`codex/global-appearance-infrastructure-20261004` (`3ceb9a80`, `d5359e33`; main report `7ca8517b`) implements global System/Dark/Mineral Light on the same pilot base. It was published after this task's prompt, and Codex A recommends integrating it after this branch (conflict-free; no Watch/HealthKit, generator or pbxproj overlap; it edits `FoamRollingPriorityDetailUITests.swift`).

Per this prompt's Part G, the app-wide theme is **not** included in this candidate. Founder/ChatGPT decide whether Build 86 ships Watch/HealthKit + Foam only, or whether the appearance commits are integrated and the combined gates re-run first. Note: Codex referenced `d43ad7cd`; this candidate's head is `4f78fce6` (+ the Build 86 bump).

## 12. Recommended build number

**86.** Last uploaded is 85, and the candidate's version is 86 (`1.0 (86)`). The guarded upload has not been run and needs explicit Founder authorization.

## Stop

Stopped for Founder/ChatGPT review of the implementation before any TestFlight upload.
