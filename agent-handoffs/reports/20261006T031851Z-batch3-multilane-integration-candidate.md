# Approved Batch 3 multi-lane integration candidate (Claude)

- **Task:** `integrate-approved-batch3-on-workout-preview` (prompt commit `cc4ac08c`, `20261006T001500Z-integrate-approved-batch3-on-workout-preview.md`).
- **Status:** **Clean integrated Native authority published. STOPPED.** No build bump, no TestFlight, no deploy, no Server change. The separate Evidence reliability lane has **not** been pulled in.
- **Generated (UTC):** 2026-10-06T03:18:51Z

## Integrated Native authority

| Item | SHA |
|---|---|
| **Integrated Native (this candidate)** | **`fc693aeb`** = `fc693aeb919efc6fa68a236092a7fa7f75767a19` on `claude/batch3-integrated-on-workout-preview-20261005` (pushed) |
| Merge commit | `09211edb` (parents `70ebf753` + `75160ae8`) |
| Base: integration preview | `70ebf753` = Batch 2 RC `793462b1` + workout reliability `e9f8a957` (TrainingLogger resolution, peptide clock fix `81943379`, Home briefing identity `b1488c2e`, Watch recap/PR/confetti + superset fixes) |
| Batch 3 approved authority | `f5257ae1` (code `44609af1`) + Founder macro correction `75160ae8` |
| Production Server (unchanged) | `b7eb1e39`, deployment `6fa4e887` |

**First-parent history from `70ebf753`:**
1. `09211edb`: the merge.
2. `fc693aeb`: two contract restorations found by the integrated gates (below).

## Macro-color correction (`75160ae8`)

The accepted Nutrition Evidence page already had one semantic mapping, written out locally in three places:
- the macro grid;
- the reporting chips and charts;
- the day meal rows.

All of them use the `.daily` palette: **Calories → `amber`, Protein → `protein`, Carbohydrates → `carbs`, Fat → `fat`**.

Generic Evidence Review instead guessed tones from labels: Protein purple, Fat amber, Calories and Carbs teal.

What changed:
- I extracted the narrowest shared authority, `NutritionEvidenceMacro` in `EvidenceKit.swift`. Each macro maps to a `KeyPath<EvidencePalette, Color>` palette token, and the label resolver accepts both the Server's `Carbs` and the Nutrition page's `Carbohydrates`.
- The Nutrition grid, day rows, reporting chips and charts all consume it, replacing the three local copies. Their appearance is unchanged: same tokens, same `.daily` palette.
- Generic review tiles for `type == "nutrition"` use `WorkflowMetricTile.Tone.nutrition(macro)`, which resolves to the same token. Dark and Mineral Light both come from the token's dynamic color.
- Non-nutrition tiles keep the locked review tones.

Tests in `EvidenceReviewHeaderDateTests`:
- `testGenericReviewNutritionMacrosUseTheNutritionEvidenceColorAuthority`: the grid macros, the Server labels resolving to the same macro, the exact palette key paths, and Reporting keys.
- `testNonNutritionReviewMetricsKeepTheLockedReviewTones`.

Geometry is unchanged (color only), so no board regeneration was needed.

## Conflict resolution

- **Exactly one conflict, as mapped:** `ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift`. I took the release side verbatim (`git checkout 70ebf753 -- …`, blob `95cb0848`), which keeps the `b1488c2e` `home.latestBriefing` identity.
- **No conflicts with** workout reliability `e9f8a957` or Batch 2 L13 `79a1a33d`.
- **Auto-merged:**
  - `EvidenceReviewDetailView.swift`;
  - `ProductionDailyDriverAPI.swift`;
  - `HomeView.swift`;
  - `FounderServerAPITests.swift`;
  - `FoamRollingPriorityDetailUITests.swift`.
- **Checks:** no conflict markers; `generate_project.py` is byte-stable on `09211edb` and `fc693aeb`.

## Integrated gates found two Batch 3 regressions, now fixed (`fc693aeb`)

Both are Build 87 source contracts that the Batch 3 lane's focused suites did not include. Both now pass.

1. **`FounderServerAPITests.testNativeNeverDerivesProvenanceFromImageSizeOrFormat`**
   - Cause: the Debug-only E review fixture held Server-shaped `"Progress photos"` provenance inside `EvidenceReviewDetailView.swift`.
   - Fix: the fixture enum moved to its own Debug-only file, `EvidenceReviewWorkflowFixture.swift`, and the generator lists it. The review view authors no provenance text. No behavior change.
2. **`PeptideScreenPresentationTests.testDisclosureRowIsSharedAndHonoursReduceMotion`**
   - Cause: Checkpoint B had replaced Training's shared `PhysiqueOSDisclosureRow` with hand-rolled buttons, which lost Reduce Motion.
   - Fix:
     - `PhysiqueOSDisclosureRow` gains an opt-in `chrome: .none` plus toggle label, hint and identifier. Its default card chrome is unchanged, so Peptide is unchanged.
     - Training Reporting and Current Protocol use it, with the locked `EvidenceKitDisclosureRow` summary.
     - Latest Training Day honors Reduce Motion.
   - Visual check: A/B simulator captures of the Training page before and after, top and bottom, Dark and Light (warm-launch captures: **pixel-identical**, 0 differing pixels below the status bar).

## Workout Match preservation (proved on the integrated tree)

- **Routing:** `EvidenceReviewPresentationRoute` sends `workoutReconciliation` to the untouched Build 87 `ScrollView` branch, inside which Batch 2's `case … where review.workoutReconciliation != nil: workoutMatchContent(review)` renders L13.
- **Code diff:** relative to L13 `79a1a33d`, the only removed lines are the task/alert modifiers, now on `body` and shared by both branches, and the DEXA exact-prefill fix. L13 code is byte-for-byte intact.
- **Tests on `fc693aeb`, all passing:**
  - unit `testOnlyWorkoutReconciliationRoutesAwayFromTheGenericReview`;
  - L13 acceptance `LoggerParityCaptureUITests.testCheckpoint5WorkoutMatchDark` and `testCheckpoint5WorkoutMatchMineralLight`;
  - E `testWorkoutMatchKeepsItsOwnBranchWhileGenericUsesTheWorkflow`;
  - generic review `testGenericReviewPresentationActionsAndCorrection`.

## Gates on the exact integrated SHA `fc693aeb`

| # | Gate | Result |
|---|---|---|
| 1 | Project generation + byte stability | Stable (two consecutive runs identical; no diff) |
| 2 | Full `PhysiqueOSTests` | **2056 run, 0 failures** (1 skipped) |
| 3 | Full `PhysiqueOSWatchTests` (`PhysiqueOSWatch` scheme, Apple Watch Series 12 46 mm sim) | **49/49** |
| 4–8 | Full `PhysiqueOSUITests`: all Batch 3 Evidence suites, Batch 2 `LoggerParityCaptureUITests` (incl. L13 Dark/Light), `FoamRollingPriorityDetailUITests`, `GoalsAcceptanceUITests`, `RecoverySleepAcceptanceUITests`, `TrainingAcceptanceUITests` (incl. the 3 Home Briefing identity journeys and the Logger journeys) | **60/60, 0 failures** |
| 7 | Workout reliability targeted (inside unit/Watch): `FinishLifecycleTests` (Watch-finish recap parity, superset Complete Set ack, no-completed-set guard), contextual recommendation decoding, lost-acknowledgement recovery, Training session authority / live projection | Pass |
| 9 | Peptide deterministic: `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` + all Peptide suites | Pass |
| 10 | Generic iOS **Release** (`generic/platform=iOS`) | **BUILD SUCCEEDED**: `PhysiqueOSWatch.app` + WidgetKit extension (Live Activity + widget) embedded; **0** Debug seam strings |

**Failure classification:** none remain.
- The 9 `TrainingAcceptanceUITests` failures carried on the Batch 3 lane (Build 87 ledger) **pass** on the integrated tree: Briefing via `b1488c2e`, and the Logger journeys in full-suite order.
- The 2 unit failures on `09211edb` were new Batch 3 regressions, not pre-existing. Both are fixed in `fc693aeb` (above).
- The first gate pass on `09211edb` was: unit 2056/2, Watch 49/49, UI 60/60, Release OK.

**Note:** running the full unit suite rewrites the committed `agent-handoffs/artifacts/home-screen-widget-v1/*.png` in the working tree, as a snapshot test side effect. The gate script restores them, and nothing was committed.

## Remaining known issues

1. **Evidence reliability lane (separate, not integrated).** It covers the intermittent "Evidence could not be loaded." problem: ns66 DNS, plus the Native resilience fix `c3d9d257`. See its report: `agent-handoffs/reports/20261006T003500Z-evidence-app-open-load-failure-audit.md`.
2. **Real Founder Progress Photos** were not validated on device (synthetic fixtures); validate after TestFlight.
3. **Energy and Weekly/Monthly Briefing charts** still use the old overlay; their owning families will follow up.
4. **Watch follow-ups (carried forward):**
   - Review/Confirmation Complete Set gating + timed sets;
   - reply before side effects / one projection build per command.

## Exact instruction: layering the Evidence reliability fix afterward

Use the reliability lane's **Batch 3 preview `9fa2428c`**, not its Build 87 commit. `9fa2428c` is a single commit on Batch 3 `f5257ae1` carrying the resolved `EvidenceView.swift` / `EvidenceViewModel.swift` / tests.

```
git fetch origin claude/evidence-reliability-batch3-preview-20261006
git checkout claude/batch3-integrated-on-workout-preview-20261005   # at fc693aeb
git merge --no-ff 9fa2428c9fb5204b03c8f9930c6ace83ce63c262
python3 ios/scripts/generate_project.py && git diff --exit-code ios/PhysiqueOS.xcodeproj
```

Dry runs (`git merge-tree --write-tree`, nothing merged):
- `fc693aeb` × `9fa2428c`: **0 conflicts**, tree `47e35b78`.
- Merging the Build 87 commit `c3d9d257` directly would conflict in `EvidenceView.swift` and `EvidenceReadModelTests.swift`. Don't do that.

After layering:
1. Re-run the full unit, Watch and UI suites and the Release compile on the resulting SHA.
2. Then the build bump and TestFlight, only with Founder authorization.

STOPPED: no build-number bump, no TestFlight upload.
