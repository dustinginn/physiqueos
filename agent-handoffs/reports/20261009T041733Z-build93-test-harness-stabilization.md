# Build 93 — test-harness stabilization (Watch WCSession fixture + Sandbox UI isolation) and widget refresh amber

- Generated (UTC): 2026-10-09T04:17:33Z
- Task: `build93-claude-test-harness-stabilization-20261008`, from prompt `agent-handoffs/inbox/prompts/20261008-claude-build93-test-harness-stabilization.md` (commit `a996b8e5`).
- Agent: Claude (existing Claude B conversation).
- Candidate branch: `claude/native-build93-test-harness-stabilization-20261008`, final ``a7e8a363``, based exactly on Build 92 `beaf5eff`. Version 1.0 (92).
- **Not done:** integration, deploy, build bump, archive, TestFlight, Recovery activation, production data or release-pointer change. DEXA cleanup was not started.
- Also included: the Founder decision "the refresh button should be amber as well", applied to the widget candidate (§6).

## 1. Watch: `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`

**Baseline.** Reproduced on Build 92 (Watch 42 mm): the test fails at line 89. After "Not Yet", Finish Workout never returns.

**Cause.** The simulator fixture harness (`-watchFixture`) has no `WCSession`.
- `requestFinish` / `cancelFinish` call `issue(…)`. With no session, `issue` sets `connectionState = .phoneUnavailable`.
- That contradicts the fixture, which models a reachable iPhone (`Fixture.connectionState = .reachable`).
- The execution surface then stops offering Finish.

**Fix: deterministic fixture stub, DEBUG only** (in `WatchWorkoutStore.install()`'s existing `#if DEBUG` fixture branch).
- A fixture that models a reachable iPhone gets a stand-in `commandSinkForTesting`. It receives commands and records them in `debugFixtureCommands`, and never applies them; the harness still accepts no mutations.
- Fixtures that model an unavailable phone (`finish-confirmation-waiting`, `idle-unavailable`) keep the real no-session behaviour.
- Production Watch connectivity is untouched: the real `WCSession` path, `issue`/`send`, retries, the delivery gate and Finish semantics are unchanged. Release builds don't compile the fixture branch.

**Result**

| Gate | Result |
|---|---|
| Watch UI suite, 42 mm (Series 11) | **10/10** (Build 92 baseline 9/10) |
| Watch UI suite, 49 mm (Ultra 3) | **10/10** |
| Watch unit, 49 mm | **75/0** |

## 2. iPhone: the six order-dependent Sandbox UI tests

The six:
- `testDatePickerTodayIsReachable…`
- `testFounderCorrectionHomeConfidenceAndLoggerShoulders`
- `testHomeWidgetStartAndResumeLinks…`
- `testWorkoutCompleteSurvivesATabSwitch…`
- `testWorkoutReviewScreenshotCardIsReachable…`
- `testWorkoutStartedAndSetCompletedThenBackgrounded…`

**Baseline.** Reproduced with Build 92 behaviour: the six run after the classes that precede `TrainingAcceptanceUITests` in the long suite (`Build89IntegrationUITests`, `Build90FounderSelectedUITests`, `LoggerParityCaptureUITests`).
- **All six failed** with the exact Build 92 symptoms: "Training Logger was not available from Log", "Could not scroll to button: trainingLogger.start", "Could not scroll to actionable control: Log weight for another date", "Missing visible text: Workout logged", "The widget Start link did not open the Logger landing".
- A single leftover saved draft, or a single active workout, did **not** reproduce it; the six still passed in four narrower attempts. The failure needs the real preceding flows.

**Cause.** Earlier tests leave persisted Sandbox training state on the simulator, which Log legitimately routes into:
- an active live workout;
- a **finished workout whose Workout Complete presentation is still pending** (`completionPresentationPending`, left by `LoggerParity…testCheckpoint4ReviewFinishComplete…`);
- plus the Sandbox terminal-session ledger.

This is test isolation, not a product regression; the product correctly resumes a real user's workout.

**Fix: per-test Sandbox isolation.**
- **App (DEBUG only):** `SandboxTrainingUITestIsolation` in `TrainingLoggerDraftStore.swift`, called first in `AppEnvironment.init` under `#if DEBUG`.
  - With `-physiqueos.uitest.fresh-sandbox-training <token>` it clears:
    - the Sandbox draft collection (`physiqueos.trainingLogger.localDraft.v1`), with those drafts' attachment folders and completion markers;
    - the Sandbox terminal ledger;
    - the device rest preference.
  - It never touches Founder Production keys (unit-tested).
  - It runs **once per token**. XCUITest relaunches the app with the same arguments for every `app.open(url)`. A per-launch reset wiped `testHomeWidgetStartAndResumeLinks…`'s own live workout in an intermediate version; the token fixed that.
- **UI tests:** `TrainingAcceptanceUITests`, `LoggerParityCaptureUITests`, `Build89IntegrationUITests` and `Build90FounderSelectedUITests` pass a per-test token from their launch helpers.
- **What did not change:** no test was skipped and no assertion was weakened or removed.

**Result**

| Run | Result |
|---|---|
| One run: `Build89` + `Build90` + `LoggerParity` classes, then the six (the Build 92 failure order) | **26/26** |
| The six alone on an erased simulator | **6/6** |
| Full iPhone UI suite, one run | **93 executed, 0 failures, in one run** (Build 92 needed 6 isolated reruns) |
| Full iPhone unit suite | **2,224 passed, 0 failures** (1 designed skip). The first two attempts died before running any test, on a simulator launch failure and then a runner hang after the 87-minute UI run; a simulator reboot fixed it |

**Residual (harness-only, not a product or suite issue).** When tests are split across **separate `xcodebuild` invocations**, the first test of a new invocation can attach to the app instance the previous invocation left running, instead of launching a fresh process.
- The device log showed no new process and no reset for that test. That one test then sees the previous run's state: `testDatePicker…` in an active workout, and `Build89…testCombinedRootReviewRoutesDark` ignoring its launch route.
- Within a single run (how the suite and release gates run), every launch is a fresh process with its own reset. Split runs should erase the simulator, or terminate the app, between invocations.

## 3. Changed files

| File | Change |
|---|---|
| `ios/PhysiqueOSWatch/WatchWorkoutStore.swift` | DEBUG fixture-only command stand-in (`debugFixtureCommands`) |
| `ios/PhysiqueOS/Networking/TrainingLoggerDraftStore.swift` | DEBUG `SandboxTrainingUITestIsolation` |
| `ios/PhysiqueOS/App/AppEnvironment.swift` | DEBUG call at the start of `init` (no-op without the argument) |
| `ios/PhysiqueOSTests/TrainingLoggerTests.swift` | `testSandboxUITestIsolationClearsOnlySandboxTrainingStateOnRequest`: Sandbox-only scope, Founder keys untouched, token once-only, no argument = no-op |
| `ios/PhysiqueOSUITests/TrainingAcceptanceUITests.swift` | Per-test token in four classes' launch helpers |

Total: 5 files, +139 lines.

There are no new files, so the generator and pbxproj are unchanged (the `0x20FF` and `0x21FF` blocks are untouched).

## 4. Merge guidance

Trial merges (`git merge-tree`) **merge cleanly** with:
- the widget/theme candidate `claude/native-build93-widget-option-b-20261008`;
- Claude Recovery Native `766bd9dc`;
- Codex Home `89378f31`;
- Codex Logger `f92f2291` (which also edits `TrainingAcceptanceUITests.swift`, in a different hunk).

Release safety: Release build (generic iOS Simulator, unsigned) succeeded; `verify_release_configuration.py` reports 1.0 (92) verified; the Release app binary contains **0** occurrences of `fresh-sandbox-training`

## 5. Real-device limits

- Only test harnesses changed, so there is nothing new to accept on a device.
- Watch Finish semantics on real hardware still need the phone; the stub exists only in the simulator fixture harness.

## 6. Widget refresh amber (Founder decision, follow-up on the widget candidate)

- Branch `claude/native-build93-widget-option-b-20261008` now at `895e4a1e`.
- Refresh in both widget families is an **amber disc** (the same `WorkoutActivityPrimaryAction` token) with the `#10202A` ink glyph.
- A bare `#C88228` glyph on the Mineral Light canvas would be about 2.8:1, below the 3:1 minimum for icons. The ink glyph on amber is at least 4.5:1.
- Status colours (freshness warning, metric icons) are unchanged, and the now-unused teal action token was removed.
- Widget tests: 28/28; renders regenerated.

## 7. Disk and cleanup

- Free disk was 15–18 GiB throughout (floor 12). Heavy runs were serialized.
- Lane simulators (iPhone "B93 Harness", Watch 42 and 49 mm) and DerivedData `dd5` and `dd6w` are removed after this report.
- Archives 85–92, other simulators, worktrees and credentials are untouched.
- While this ran, the ChatGPT app was found wedged (no window; main process not answering). With the Founder's OK it was terminated cleanly and relaunched; no Codex command was running at the time.

## 8. Next step

Include this branch in the combined Build 93 Native integration. The Build 93 UI and Watch gates can then run as one full pass without isolated reruns.
