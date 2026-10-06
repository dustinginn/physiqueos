# Build 89 · integrated release-candidate source (Claude)

**Task id:** `build89-integration-source-candidate-20261006` (prompt `agent-handoffs/inbox/prompts/20261006T170000Z-claude-build89-integration-source-candidate.md` at ca459cbc)

**Status:** BUILD 89 INTEGRATED SOURCE CANDIDATE READY FOR FOUNDER PHYSICAL ACCEPTANCE / RELEASE AUTHORIZATION.

This candidate is not released and has not been through the release metadata or archive gates, so it is not TestFlight-ready. `latest.json` / `latest.md` still point to Build 88.

## Authority

| Item | Value |
|---|---|
| **Integration candidate SHA** | `4d4ca18711d3065536cc71d0555118fd969dd409` |
| Branch | `claude/native-build89-integrated-source-candidate-20261006` (pushed, not merged) |
| Base | Build 88 `7fce3b9708c063f3c6b58571778c595012b5de6d` (exact shipped source; still release/TestFlight authority) |
| Claude A (pinned) | `f3579d87b2f111bd6da0e78ff928e7492efffc00` |
| Claude B (pinned) | `156808fae50fc99ddbd6e1f0e3e90abec69ed26b` |
| Codex (pinned) | `5b79118f84ac15ac190e0d73e13e71606c2f6d2f` |
| Build number | Still **88** (`APP_BUILD_NUMBER`, all 8 `CURRENT_PROJECT_VERSION`); no Build 89 metadata |
| Production Server | Not touched |

## Strategy and commits

I used `--no-ff` merges of each exact pinned SHA, in the prompt's order. No cherry-picks or rebases. I used only the single RC worktree: no EnterWorktree, no secondary worktree.

1. `5da4950b`: merge Claude A `f3579d87` onto Build 88. No conflicts.
2. `1ef4cca2`: **Live Activity micro-fix** (details below).
3. `271c3eff`: merge Claude B `156808fa`. RootTabView auto-merged and I verified it semantically.
4. `1f440f15`: merge Codex `5b79118f`. TrainingAcceptanceUITests auto-merged and I verified it semantically.
5. `9b890109`: integration tests (route and DEBUG-seam guard, `Build89IntegrationUITests`), plus a one-line whitespace fix: B's `BriefingPresentation.swift` had a trailing blank line at EOF that failed `git diff --check`.
6. `4d4ca187`: integration proof package I1–I5, plus a frame-based DEXA scroll fix in the integration UI test.

Lane commits: all 14 A, 9 B and 11 Codex commits are ancestors of the candidate; 0 are missing. Every non-overlap file is byte-identical to its pinned candidate.

## Live Activity micro-fix (`1ef4cca2`)

In `ios/PhysiqueOSShared/WorkoutLiveActivityViews.swift`, `WorkoutClockBlock`:
- **No-rest branch only:** this covers Rest Off, pre-first-set and privacy. The elapsed **WORKOUT** clock glyph changed from `dumbbell.fill` to `stopwatch`.
- **Unchanged:**
  - the active-rest decision: `timer`/`stopwatch`, the REST · STOPWATCH / COUNTDOWN / COMPLETE labels, the rest clock, the green treatment and accessibility;
  - the timer, intent and state-machine logic.
- **How:** both decisions now live in a small `WorkoutClockPresentation` value, following the file's existing `WorkoutActivityPresentation` pattern, so tests can assert them without pixels.
- **Dynamic Island:** unchanged. Its `dumbbell.fill` uses (expanded header, compact leading, minimal) are workout-identity glyphs, not the elapsed-time slot; the compact elapsed trailing has no glyph. The same incorrect semantic does not exist there.

**Tests:**
- no-rest / pre-first-set / Rest Off / privacy / all-sets-complete WORKOUT is `stopwatch`, never a workout or bars glyph;
- the active rest presentation is unchanged and green (value test plus a source guard);
- Complete Set moves the clock from WORKOUT to REST · STOPWATCH, proven twice:
  - at the presentation level;
  - through the real intent → `TrainingSessionAuthority` → rendered-state pipeline. The rendered rest equals the authority's rest and revision.

**Mutation check:** restoring `dumbbell.fill` fails all 4 new tests.

## Conflict audit and resolutions

Changed-file intersections, measured before resolving:
- **A↔B:** `RootTabView.swift` only (expected).
- **A↔Codex:** none.
- **B↔Codex:** `TrainingAcceptanceUITests.swift` only (expected).

There were no unexpected overlaps. Codex's report had audited B at `8826f914`; the final B changed the UI test file, which explains the B↔Codex overlap. I also checked semantic cross-effects:
- **Calories green:** consumed only by the Nutrition / Evidence `NutritionEvidenceMacro` authority. No Briefing or Watch code uses it.
- **A's theme/typography tokens:** additive.
- **pbxproj / generator:** only A changed them.

**Resolution 1: RootTabView.** The hunks are disjoint and both sides are kept, all inside the `#if DEBUG` `AppearanceReviewLaunchConfiguration`:
- A's `morning-check-in`;
- B's `briefing-history`;
- B's `briefing:<artifactId>` fallback, evaluated before `evidenceReviewPath`.

Shipping routing is untouched.

**Resolution 2: TrainingAcceptanceUITests.** The hunks are disjoint and both suites are kept:
- **B:** `openBriefingFromHistory(artifactId:)` and the updated DEXA / Weekly / Photo assertions.
- **Codex:** the appearance-aware `launchInSandbox(appearance:)`, the C1/C2 Dark + Mineral capture journeys, the `captureBuild89` helper, and the canonical Performance Records assertions.

## Changed-file inventory vs Build 88

There are 63 `ios/` files, +10,050 / −3,611, plus report/artifact files under `agent-handoffs/artifacts/` and one lane report under `agent-handoffs/reports/`.

| Owner | Files |
|---|---|
| A only | 31: Watch app/tests, Live Activity, Priority Detail, Morning Check-In/manual weight, Confidence, Appearance, theme/typography, generator + pbxproj + Watch Info.plist |
| B only | 14: Briefings read model/API/mapper, the five type sections, History, Detail, `BriefingPresentation`, `EvidenceKitComponents` (scrub gesture visibility), Briefing tests |
| Codex only | 14: Training read model + Detail PR card, `EvidenceKit` (Calories), `HomeJourneyFieldView`, Logger view/view model, fixtures, widget view, focused tests |
| A + B | `RootTabView.swift` |
| B + Codex | `TrainingAcceptanceUITests.swift` |
| Integration only | `AppTabTests.swift`, `WorkoutLiveActivityIntentTests.swift` |

**Integration edits to lane-owned files:**
- A's `WorkoutLiveActivityViews.swift` and `WorkoutLiveActivityViewTests.swift` (the micro-fix);
- B's `BriefingPresentation.swift` (EOF whitespace only);
- the shared UI test file (an added `Build89IntegrationUITests` class).

**Other audit results:**
- **Server:** 0 Server files or semantics changed. Every changed path is `ios/` or `agent-handoffs/`.
- **Handoff files:** no report/review artifact controls runtime behavior. The project file has 0 `agent-handoffs` references. Only tests read or write them; the known `HomeWidgetTests` PNG side effect is restored after each run.
- **Issue #7:** the iPhone Logger rest stopwatch for phone-only workouts is NOT implemented. The Logger diff contains no rest-timer changes.

## Gates

All gates ran on the dedicated simulators `Build89Int iPhone 17 Pro` and `Build89Int Watch Ultra3` (iOS/watchOS 27.0), sequentially, with Sandbox fixtures only.

| Gate | Result |
|---|---|
| Live Activity suites (View/Intent/Contract/Coordinator) | 72/0, including 4 new tests; mutation check fails all 4 |
| Combined focused unit suites (Codex + A + B + integration; 27 classes) | **848 / 0** |
| Full Native unit suite (`PhysiqueOSTests`) | **2132 / 0**, 1 skip: `RecoverySleepReadModelTests.testLiveFounderProductionCaptureDecodesAndAdapts`, which is local-only and needs a live Production capture; correctly not run |
| Affected combined UI journeys | Briefing parity, Weekly+Photo, Midweek, Recent History / Training Detail / correction, Codex C1/C2 Dark+Mineral: all pass |
| Build 89 integration UI | 4/4: combined routes Dark + Mineral; Option B set values Dark + Mineral |
| Full iPhone UI acceptance suite | **73 / 0** across 10 suites, including all five Briefing types + History, Training Logger checkpoints, Evidence / Home / Goals / Recovery / Priority |
| Full Watch unit suite | **57 / 0** |
| Full Watch UI suite | **6 / 7**: see below |
| Watch↔phone parity | Covered in the full suites: WatchWorkoutTransport, TrainingSessionAuthority, LiveProjection, Build83FinishLifecycle; Watch FinishState + Reducer |
| Debug compile | iPhone app + tests (build-for-testing) and Watch app + tests: succeeded |
| Generic Release compile (`generic/platform=iOS`, unsigned) | **BUILD SUCCEEDED**: iPhone app, embedded Watch app (arm64 + arm64_32), Live Activity / Widget extension. Plus Jakarta Sans bundled in the Watch app. |
| `verify_release_configuration.py` | verified: 1.0 (88), extension + Watch wiring |
| Generator determinism | stable; pbxproj SHA-256 `2a39f485…7fd8c` unchanged after regeneration |
| `git diff --check` 7fce3b97..candidate | clean |
| Release seam scan | **0** DEBUG seams in the app, Watch and extension binaries (all `-physiqueos.*` review flags, `appearance-review`, review route helpers) |

**Watch UI failure.** `WatchWorkoutNavigationUITests.testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` fails at line 89 (`finish.waitForExistence` after Not Yet).
- I did not waive it on history. I reproduced it on **exact Build 88** from a `git archive` export of `7fce3b97`: same test, same line, same assertion. The test file is unchanged between Build 88 and the candidate.
- This is the documented fixture limitation (no WCSession), not an integration regression.

**Seam-scan notes.**
- The strings `morning-check-in` and `briefing-history` do appear in the Release app binary. They are production Server native-resource names (`readResource`, cache invalidation), also present in Build 88. They are not the DEBUG routes.
- The unit test `AppTabTests.testCombinedReviewRoutesStayDebugOnlyAndKeepBothLanes` guards that the review table is entirely inside `#if DEBUG`.

**Build state of the gates.** Product sources at the candidate SHA are identical to the tree that was Release-compiled and fully unit/UI tested. Later commits changed only the integration UI test class and the report package.

**Load note.** Machine load spiked past 500 because of another user's system processes. One Debug build under that load printed spurious "failed with exit code 0" lines; a clean incremental rebuild had 0 errors. All gates above ran after load recovered.

## Integration proof package (I1–I5)

The package is `agent-handoffs/artifacts/build89-integrated-source-candidate-20261006/` (README, boards, raw captures, deterministic renderer). It contains real shipping SwiftUI renders and simulator captures from the integrated tree.

The package lives on the candidate branch at commit `4d4ca187`. Each board below is a path relative to the package directory:

- **I1** · Live Activity: no-rest WORKOUT stopwatch + green REST · STOPWATCH: `boards/I1-live-activity-stopwatch.png`
- **I2** · Root routing: Morning Check-In, Briefing History, direct briefing, Evidence: `boards/I2-root-routing.png`
- **I3** · Logger: Suggested Today selection control + Option B 16 pt Semibold: `boards/I3-logger.png`
- **I4** · Training Detail PR card: `boards/I4-training-detail-pr-card.png`
- **I5** · DEXA rails + WHAT THIS SCAN MEANS lead: `boards/I5-dexa-briefing.png`

Full GitHub URLs to these files exceed the publisher's long-token safety scan (a false positive on long artifact paths), so this report gives package-relative paths. I verified that all five files exist in the pushed candidate commit. Before publishing, I inspected every board and the key raw captures (I1–I5) by eye.

**Suggested Today.** It appears only when the Production payload carries `initialCategorySuggestion`; Sandbox never offers it. I3 therefore uses the shipping component renders and the canonical selection tests in `TrainingLoggerTests`. Option B is shown in the real sandbox Logger.

## Storage

| Point | Free |
|---|---|
| Start | ~25 GiB |
| During gates | dipped to 13 GiB, driven by other lanes on this shared Mac. I freed my own result bundles and Watch DerivedData mid-run. |
| After cleanup | **17 GiB** |

Cleanup removed my dedicated simulators, DerivedData and result bundles. The Build 88 archive and all pinned refs are intact. I deleted no other lane's files.

## Known remaining issues

- **Watch UI:** the pre-existing Build 88 `testFinalSetFinish…` WCSession fixture limitation remains (unchanged).
- **Suggested Today:** not exercisable in Sandbox. It needs physical acceptance against Production.
- **Debug compiler warnings:** a few pre-existing actor-isolation warnings remain (no errors).
- **Open Founder decision:** the Lane A `priority*` / `capture*` palette tokens are not unified with `redesign*`. That decision is still open and unchanged here.

## Physical-device acceptance checklist (after an integrated build is authorized)

1. **Live Activity:**
   - Start a workout; before the first set the Lock Screen shows **WORKOUT** with a green stopwatch.
   - Complete Set from the Live Activity switches it to green **REST · STOPWATCH**.
   - Rest Off shows WORKOUT/stopwatch.
   - Check the Dynamic Island compact and minimal views.
2. **Watch:**
   - Mineral clock capsule (Option A).
   - Independent iPhone and Watch appearance; an unset Watch defaults to Dark.
   - Offline appearance persistence.
   - Complete Set gating during phone Review.
   - Timed-set display.
   - Finish parity with the phone, including the PR card.
3. **Morning Check-In / manual backdated weight / Home Confidence** against real Production.
4. **Priority Detail family** on real priorities.
5. **Briefings:**
   - the five real records (Midweek, Weekly, Monthly, Photo, DEXA) via History;
   - Midweek Sun–Tue slots;
   - DEXA rails, delta colors and the WHAT THIS SCAN MEANS lead;
   - Monthly month/year;
   - History accents;
   - chart scroll/scrub;
   - Photo paired viewer;
   - no historical regeneration.
6. **Training Detail:** the PR card shows only Server `performanceRecords`, below Workout Summary, and is omitted when empty.
7. **Nutrition:** Calories are green; other macros are unchanged.
8. **Home:**
   - "4 weeks to goal target";
   - Remaining "4 weeks";
   - Phase "about 4 weeks remaining".
9. **Widget:** refresh accent matches Start Logger teal.
10. **Logger:**
    - the Suggested Today explicit control and teal check, in sync with the Training Area tile (Production);
    - REPS/LOAD 16 pt Semibold.
11. **General smoke:** Evidence, Goals, You, Log.

## Explicit non-actions

- No build-number bump.
- No archive or distribution signing.
- No TestFlight upload.
- No `latest.json` / `latest.md` change (they remain Build 88).
- No Server deploy, no production mutation.
- No simulator was paired to Founder Production.
- Nothing was merged to main beyond this report-only file.
