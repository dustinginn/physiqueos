# Build 90 Native integration candidate (pre-bump)

**Recommendation: READY FOR BUILD 90 RELEASE BUMP.**

**Status:** the Build 90 Native integration candidate is validated and ready for release-bump authorization. Nothing was bumped, archived, uploaded or deployed.

## Inputs
| Input | Exact SHA |
|---|---|
| Shipped Build 89 base | `51399425b683d6a6e36b5c91836290259e31a7e0` |
| Claude A (Founder-selected Logger / Watch handoff / Photo / Watch placement) | `a14eb4c45ee602025cc7d666c96956b7972beac1` |
| Claude B (Energy + Recovery/Sleep) | `8c3172e1e2493b025114f12cd8b0bdf2c58d484e` |

## Method
1. `git switch -c claude/native-build90-integration-candidate-20261007 51399425`.
2. `merge --no-ff a14eb4c4` → `ae869c28`.
3. `merge --no-ff 8c3172e1` → `9763ab23`.

Both merges resolved automatically, so no manual or semantic resolution was needed.

**Shared file:** only `ios/PhysiqueOS/App/AppEnvironment.swift`, in disjoint hunks, and both are kept:
- Claude A: `watchCompanion` and `watchAppLauncher`.
- Claude B: DEBUG Energy/Recovery fixture wrappers on `recoverySleepScope`, `recoverySleepAPI` and `energyAPI`.

## Exactness proof
- **No extra changes:** `HEAD − A` equals B's change set, and `HEAD − B` equals A's change set.
- **Byte-identical files:** every A-only and B-only file matches its candidate byte for byte.
- **No foreign commits:** none from Codex progression or access work, Operating Plan, DEXA appointment, or report-only main.
- **Size:** 23 iOS files.
- **Project:** no pbxproj or generator change.

## Validation (lane simulators: iPhone 17 Pro, Ultra 3 49 mm, Series 12 42 mm)
| Gate | Result |
|---|---|
| Focused iPhone (authority, Logger, rest, live projection, Build 83, Live Activity ×4, Briefing V3, Photo ×2, Energy, Recovery/Sleep ×2, AppTab navigation) | **502 / 0** (1 designed skip) |
| Full PhysiqueOSTests | **2159 / 0** (1 designed skip) |
| Watch unit | **59 / 0** |
| Watch UI, 49 mm and 42 mm | 6/7 each. See note 1. |
| Full iPhone UI suite | 72 tests, 0 failures in the xcodebuild summary, but exit 65. See note 2. |
| Generic iOS Release | **BUILD SUCCEEDED** |
| Embedded bundles | App `com.physiqueos.native.dev` 1.0 (89); Watch `…watchkitapp` 1.0 (89), arm64 + arm64_32; Live Activity/Widget `…WorkoutActivity` 1.0 (89) |
| `verify_release_configuration.py` | OK (1.0 (89), AppIcon, HealthKit app-only, App Group, Live Activity + Home widget) |
| Release seam scan | See note 3. |
| `git diff --check` 51399425..candidate | Clean |

**Note 1, Watch UI.** The only failure is `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` at `WatchWorkoutNavigationUITests.swift:89` (XCTAssertTrue). I re-ran it on an exact `git archive` export of Build 89 `51399425`, and it fails identically: same line, same assertion. The test file is unchanged. This is the known no-WCSession harness limitation, not a regression.

**Note 2, iPhone UI.** One test, `EnergyRecoveryRedesignUITests.testRecoveryBackLabelsFollowTheRealParentAndAllNightsPages`, failed once: an 8 s wait for `sleep.trends.screen`. The runner then restarted. Re-run alone, the class passed **7/7 twice**. The failure was not reproducible. Every UI test class, including `Build90FounderSelectedUITests`, `EnergyRecoveryRedesignUITests`, `LoggerParityCaptureUITests` and `TrainingAcceptanceUITests`, reported passed.

**Note 3, seam scan.**
- **0** `-physiqueos.*` or `-watch*` launch-flag strings, and **0** review/fixture type names, in the app, Watch and Live Activity binaries.
- The 9 broad-pattern "evidence-review" matches are pre-existing production Evidence Review command IDs (`ProductionCommandAPI`), not seams.
- **Controls:**
  - Release: production handoff strings are present (3).
  - Debug dylib: fixture strings are present (47).

## Content preserved
**Claude A**
- B90-1 A: docked clock with WORKOUT and REST, canonical End Rest, no phone Pause/Resume, hidden during Finish confirmation.
- B90-2 B: centered handoff modal.
  - Ready triggers `startWatchApp`, and the copy never claims a launch succeeded.
  - Use without Watch is never re-prompted.
  - The modal dismisses only on `watchStartedAt`.
  - On Watch chip; the Ready card is removed.
- B90-3 B: centered photo group with a bounded stage, labels on the photos, and the canonical interpretation card below.
- B90-4 A: centered Watch actions (Start, Idle, orphan) at 49 and 42 mm.
- All three defect fixes:
  - the Ready/start-clearing guard;
  - appearance-slot forwarding;
  - fractional `startedAt` parsing.

**Claude B:** all approved Energy and Recovery/Sleep behavior, byte-identical to `8c3172e1`.

**DEXA:** the appointment dead end is unchanged and remains **backlogged to OP-A**.

## Physical-device acceptance checklist
1. **Logger, phone-only.** WORKOUT clock, then REST with End, then WORKOUT again. Background continuity. Finish hides the clock; Back restores it.
2. **Synchronization.** Phone, Live Activity and Watch show the same rest, and End clears all three.
3. **Watch handoff, unlocked on-wrist Watch.** Ready brings PhysiqueOS forward. Start auto-dismisses the phone card and shows On Watch.
4. **Watch handoff, locked or off-wrist Watch.** Waiting or Not reachable, stated truthfully. A manual Start on the Watch dismisses.
5. **Use without Watch.** No re-prompt after leaving, relaunching or reconnecting.
6. **Photo Briefing on real media.** A bounded centered pair, labels on the photos, the interpretation card, synchronized zoom and pan, Close.
7. **Watch.** Centered Start, Idle and orphan screens in Mineral and Dark on the Ultra 3. A live Watch appearance change applies without relaunch.
8. **Energy.** Estimated-expenditure wording and footnote, kcal, Try again, 44 pt Details/Hide, charts and navigation.
9. **Recovery/Sleep.** Sleep Window date labels and typical band, the floating nightly Total Sleep floor, zero-based bar summaries, Trends, All Nights, Night Detail and the back labels.
