# Build 90 Energy + Recovery implementation ready for integration

- **Task id:** `claude-build90-energy-recovery-implementation-20261006`
- **Prompt:** `agent-handoffs/inbox/prompts/20261006T230100Z-claude-build90-energy-recovery-implementation.md` @ `de616667`
- **Agent:** Claude B. This lane continued in the same Remote Control conversation and worktree; no new session or worktree.
- **Base:** shipped Build 89 `51399425`.
- **Approved design:** `7e501714`.
- **Implementation candidate:** `8c3172e1e2493b025114f12cd8b0bdf2c58d484e` on `claude/native-build90-remaining-redesign-20261006` (pushed, not merged).
- **Production Server:** `b7eb1e39` / `6fa4e887`, unchanged (read-only check).

**What was not done:** no Build 90 bump, no TestFlight, no Server change or deploy, no production mutation. No simulator was connected to Founder Production.

**STATUS:** Build 90 Energy + Recovery implementation ready for integration.

## Founder approvals implemented

The Founder approved Energy + Recovery/Sleep exactly as boarded at `7e501714`, including all six deliberate deltas. The candidate keeps each of them:
1. "Avg Est. Expenditure" / "Est. expenditure" plus the estimate footnote. The wording is centralized in `EnergyEvidenceCopy` and locked by a unit test.
2. The canonical `kcal` formatter.
3. Sleep Window date labels plus the typical-window band.
4. Explicit Try again on failure states:
   - Energy;
   - Recovery root and Trends;
   - Night Detail;
   - Goal dates.
5. The 44 pt Details / Hide disclosure for Source & Data.
6. The nightly Total Sleep line uses a floating floor, while bar summaries stay zero-based (`SleepTotalChart.floorHours`).

The visual output is the approved candidate's. The only presentation-adjacent additions are accessibility identifiers for tests: one for each Energy selected-week readout, and one for the Total Sleep chart.

## Changes since the approved candidate (`7e501714` → `8c3172e1`)

- **Design-capture seams removed from every view.** These were the scroll offset, open sheet, sheet scroll, expanded disclosures, preselected chart point and preselected range.
  - `EvidenceKitComponents.swift` is back to byte-identical with Build 89.
  - The only remaining seam is the DEBUG UI-test state/scope seam (`-physiqueos.energy-recovery-review.state|scope`). It wraps the Sandbox fixture APIs only and is compiled out of Release, the same pattern as the existing `EvidenceRedesignReview`.
- **Testable extractions with no behavior change:**
  - `EnergyEvidenceCopy`: approved wording, the compact dash, verbatim completeness tags.
  - `SleepContinuitySeries`: Continuity runs and gap bridges.
  - `SleepTotalChart.floorHours`.

## Files changed vs Build 89 `51399425`

| File | Change |
|---|---|
| `ios/PhysiqueOS/Presentation/Evidence/EnergyHistoryView.swift` | Energy root, sheets, rows, `EnergyEvidenceCopy` |
| `ios/PhysiqueOS/Presentation/Evidence/EnergyChartViews.swift` | Both Energy charts, legend, selected week; legacy `chartScrub` replaced |
| `ios/PhysiqueOS/Presentation/Evidence/RecoverySleepViews.swift` | Recovery root, Trends, Night Detail, All Nights, states |
| `ios/PhysiqueOS/Presentation/Evidence/SleepEvidenceCharts.swift` | Locked stage palette, Total Sleep, Window, contained Timeline, Continuity point/line, Stage Mix |
| `ios/PhysiqueOS/Presentation/Evidence/WeightHistoryView.swift` | Weight harness components private → internal; `WeightStatePanel` gains an optional action. No Weight visual change; the Weight UI tests pass |
| `ios/PhysiqueOS/Networking/EnergyAPI.swift` | DEBUG-only UI-test state/scope seam |
| `ios/PhysiqueOS/App/AppEnvironment.swift` | DEBUG-only wrappers for that seam |
| `ios/PhysiqueOSTests/EnergyReadModelTests.swift` | + `EnergyEvidencePresentationTests` (6) |
| `ios/PhysiqueOSTests/RecoverySleepPolishTests.swift` | + `RecoverySleepRedesignPresentationTests` (4) |
| `ios/PhysiqueOSUITests/RecoverySleepAcceptanceUITests.swift` | + `EnergyRecoveryRedesignUITests` (7) |

There is no `project.pbxproj` or generator change, so no determinism run was needed. The review package from `7e501714` (`agent-handoffs/artifacts/build90-remaining-redesign-20261006/`) is still on the branch.

## Preserved contracts and interactions

**Energy:**
- the canonical `energy` read model;
- Goal / phase / All scope;
- the 1M–All range;
- Weekly and Daily History sheets, with Done and their own back trail;
- the five completeness states;
- the selected week;
- the conditional Nutrition Day / Activity links (unchanged destinations);
- pull-to-refresh and foreground refresh;
- tap + horizontal scrub + vertical scroll;
- the `‹ Energy` / `‹ Daily Energy History` back labels.

No as-of / stale field was invented.

**Recovery / Sleep:**
- the canonical `recovery-sleep*` reads;
- Goal scopes and their date states;
- 2W–All;
- the weekly threshold and paging (30 per page);
- `strategicUse` quarantine and 14-night eligibility (no change to any Sleep semantics);
- root night toggle → Open night;
- Trends, Continuity selection, Timeline inspect, Stage Mix, Source & Data, All Nights, Night Detail;
- additional sleep, approximate clock times;
- staged / unstaged / recalculating;
- loading / failure / empty / not-available / night-not-found;
- parent-aware back labels: `‹ Evidence Hub`, `‹ Recovery`, `‹ Sleep Trends`, `‹ All Nights`.

## DEXA appointment dead end: not fixed here; OP-A's first fix

**Audit:** Priority Detail's "View DEXA Appointment" href maps to `.operatingPlanDexaAppointment` (`ProductionDailyDriverAPI.swift:1227`). The canonical Coaching Updates destination is `.operatingPlanStrategy(strategyType: "briefings", strategyId: <coaching protocol id>)`.
- That id is Server-owned. It is emitted only by the Operating Plan read (`OperatingPlanReadService.js:74`, `getOperatingPlanStrategyHref("briefings", coaching.id)`).
- `CoachingUpdatesAPI.fetchDetail(strategyId:)` requires it.

**Why it is not a tiny fix:** opening Coaching Updates from the DEXA action would need either:
- a new Operating Plan read plus routing inside an Operating Plan view; or
- a Server href change.

Both are broader than a behavior-preserving navigation correction.

**Decision:** left unchanged. The DEXA appointment page was not visually touched. It is backlogged as **OP-A's first fix**: resolve the coaching protocol id from the Operating Plan read, or have the Server emit the Coaching Updates href for the appointment stage.

## Tests

All runs used a dedicated, since-deleted iPhone 17 Pro iOS 27 simulator with Sandbox fixtures.

**Focused unit: 86/0.**
- `EnergyReadModelTests`, plus the new `EnergyEvidencePresentationTests` (6):
  - approved wording, with no coaching language;
  - `kcal`;
  - the em dash;
  - verbatim completeness tags;
  - fixture coverage of all five tags;
  - spoken selected week.
- `RecoverySleepPolishTests`, `RecoverySleepReadModelTests`, plus the new `RecoverySleepRedesignPresentationTests` (4):
  - Continuity runs and gap bridges;
  - recalculating / missing / edge gaps;
  - the nightly floating floor vs zero-based bars;
  - stage palette in both appearances.

**New UI coverage: `EnergyRecoveryRedesignUITests`, 7/7.**
- **Energy estimate wording and sheets:** estimate wording and footnote; All Energy scope; the Weekly History sheet with Done; the Daily Energy History sheet with all four non-complete tags; the Nutrition Day link → `‹ Daily Energy History`; the Activity link → `‹ Energy`.
- **Energy chart arbitration:** Over Time tap selects a week, horizontal scrub moves it, a tap on Weekly Balance selects a week, and a vertical swipe starting on the chart scrolls the page.
- **Energy states:** failed → Try again; empty stays honest.
- **Recovery back labels and paging:** `‹ Evidence Hub` / `‹ Recovery`; Trends `‹ Recovery`; All Nights pages to the oldest fixture night (30 per page) → `‹ All Nights`.
- **Recovery chart arbitration and disclosures:**
  - root chart tap toggles Open night on and off;
  - Trends tap and horizontal scrub; vertical scroll from the chart;
  - Continuity tap selects a night;
  - Stage Mix Collapsed → Expanded;
  - Timeline tap inspects a stage;
  - Source & Data Collapsed → Expanded.
- **Recovery weekly view (6M):** detail charts withheld.
- **Recovery states:** failed → Try again; Goal dates failed → Try again; not available.

One test initially failed because the test itself assumed every completeness tag exists in the default Build Lean Mass scope. They exist only across All Energy, which is correct product behavior. The test was fixed to select All Energy and passes.

**Existing `RecoverySleepAcceptanceUITests`: 3/3.**

**Full `PhysiqueOSTests`: 2142/0**, with 1 designed skip.

**Relevant Evidence UI suites: 53/0.** The run covered:
- `EvidenceHubTimelineUITests`
- `EvidenceTrainingNutritionWeightUITests` (incl. the Weight scrub / scroll and disclosure tests)
- `EvidencePhotosDEXAUITests`
- `EvidenceIntakeReviewUITests`
- `RecoverySleepAcceptanceUITests`
- `EnergyRecoveryRedesignUITests`
- `TrainingAcceptanceUITests` (incl. the Energy journey)

The machine load was 130–160 for part of this run; nothing was flaky.

**`git diff --check`:** clean.

## Release

- **Generic Release compile:** `xcodebuild build -scheme PhysiqueOS -configuration Release -destination generic/platform=iOS CODE_SIGNING_ALLOWED=NO` → **BUILD SUCCEEDED**. The product embeds `PhysiqueOSWatch.app` and `PhysiqueOSLiveActivity.appex` (Workout Live Activity + Home widget).
- **Seam scan:** across the app, Watch app and extension binaries, every count is **0**:
  - `energy-recovery-review`;
  - `appearance-review`;
  - `physiqueos.evidence-review`;
  - `EnergyRecoveryRedesignReview`.
- **`verify_release_configuration.py`:** passed. It reports version 1.0 (**89**), so there is no bump. AppIcon, HealthKit app-only capability, App Group, and the Live Activity + widget extension are all verified.

## Storage

- **Free space at lane start:** 28.22 GiB.
- **Free space after:** 17.28 GiB.
- **Why it dropped:** other users and sessions on the shared Mac were writing during the lane. Before the Release build, free space read 14.30 GiB.
- **This lane's leftovers:** its regenerable DerivedData (`dd`, `ddr`) and its dedicated test simulator were removed after validation.

## Integration notes

- **Conflicts with the other Build 90 lane:** none expected. That lane owns the Logger stopwatch, Watch handoff, Photo Briefing expanded viewer and Watch button placement, and its files are not in this diff.
- **Shared-file risk:**
  - `AppEnvironment.swift`: two DEBUG blocks in the `energyAPI` / `recoverySleepAPI` getters plus the `recoverySleepScope` initializer.
  - `WeightHistoryView.swift`: access-level-only changes.
  - Merge-tree check against the other lane's Build 90 design package `3d7c54ab`: `git merge-tree` is **clean**. The other lane touches only `PhotoBriefingSections.swift`, `TrainingLoggerView.swift`, `TrainingAcceptanceUITests.swift` and `WatchWorkoutViews.swift`, which are disjoint from this lane.
- **Stale-check rule:** `HomeWidgetTests` rewrites the tracked widget PNGs on every unit run; they were restored.
- **Integration step:** merge `8c3172e1e2493b025114f12cd8b0bdf2c58d484e` into the Build 90 integration after the Founder-changes lane. Re-run unit, Evidence UI and Release, then bump in the release lane only.

## Confirmation

- No Server change or deploy.
- No build-number bump.
- No TestFlight upload.
- No production mutation.
- The Codex progression, production-access and other Build 90 lanes were not touched.
