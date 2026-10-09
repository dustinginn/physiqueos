# Build 93 UI gate evidence reconciliation — proposed scoped alternative, Founder decision required

- Generated: 2026-10-09T15:14:36Z
- Assignment: `agent-handoffs/inbox/prompts/20261009-codex-build93-ui-gate-evidence-reconciliation.md`
- Assignment authority: `fce25506`
- Native candidate assessed: `ac3def4ce6941138719f3a39c7cbbfc521b29eb0`
- Server candidate context: `e03f6768627f49175c476208eca79c99ae3d5ee9`
- Status: **ASSESSMENT COMPLETE / NO GATE CHANGE / NO RELEASE**

## Verdict

The evidence supports a **precisely bounded alternative** to rerunning every iPhone UI test, but only after explicit Founder approval. The alternative is defensible because every Build 93 lane's shipping source in final `ac3def4c` is blob-identical to its tested source candidate, except for the intentional generator union and the one-file Energy correction; that Energy correction already passed its authoritative UI journey on exact final `ac3def4c`.

The substitution is not risk-free. It would rely on Claude's Build 92-based full-suite pass for unchanged journeys and use a fresh 12-test integrated matrix for Build 93 composition boundaries. It cannot detect every cumulative-order, broad navigation or unrelated visual regression that a full run might expose. The current binding gate therefore remains unchanged until the Founder chooses one of the two options in the final section.

No Xcode build/test, candidate edit, release-gate mutation, deployment, archive or upload was performed in this assessment.

## Important count correction: final Build 93 has 104 iPhone UI tests

Static enumeration of `func test…` methods establishes:

| Candidate | iPhone UI methods | Watch UI methods | Meaning |
|---|---:|---:|---|
| Build 92 `beaf5eff` | 93 | 10 | shipped baseline |
| Harness `a7e8a363` | 93 | 10 | Claude's one-pass **93/93** evidence |
| Integrated pre-Energy-fix `1b209ebf` | **104** | **11** | 11 Build 93 UI methods were added after the 93-test baseline |
| Final `ac3def4c` | **104** | **11** | Energy fix changed production only; no test method was added or removed |

The 11 added iPhone methods are exactly:

- 7 `BriefingRecoveryAcceptanceUITests` methods;
- `FoamRollingPriorityDetailUITests.testHomeOddFinalPrioritySpansTheBottomRowInDarkAndMineralLight`;
- `FoamRollingPriorityDetailUITests.testHomeAccessibilityDynamicTypeUsesReadableSingleColumnPriorities`;
- `LoggerParityCaptureUITests.testProgressionSuggestionActionabilityDark`;
- `LoggerParityCaptureUITests.testProgressionSuggestionActionabilityMineralLight`.

The one added Watch method is `WatchPrimaryActionThemeUITests.testPrimaryWorkoutActionsRenderInBothAppearances`.

Accordingly, retaining the original whole-target approach must now mean **104/104 iPhone UI**, not 93/93. A 93-test result cannot by itself describe the final test target.

## Source and integration reconciliation

The final Native history is a linear integration on shipped Build 92, followed by the narrow Energy fix. Stable patch IDs match for the Home, Logger, Recovery correction, widget Option B/refresh and harness commits. End-state blob comparison separately proves that the complete widget/theme shipping surface matches its tested source candidate; only the generated project needed composition.

| Lane / passing source | Evidence on source | Final-tree comparison | Integration overlap and risk |
|---|---|---|---|
| Home / Morning / DEXA `89378f31` | 427 focused unit/contract passes; narrow/large UI checks in Dark and Mineral Light | **All 15 lane-owned blobs are byte-identical in `ac3def4c`** | No source conflict. Fresh integrated UI is still warranted because this lane was not reached before the `1b209ebf` full run stopped. |
| Logger `f92f2291` | 103 Logger units; 171 authority/transport units; progression UI passed Dark and Mineral Light | Both shipping files are byte-identical. The two test files differ only by the later harness-isolation additions and Build 93 version expectation. | Low product risk; moderate harness-composition risk, covered by fresh Logger UI plus full units. |
| Recovery `766bd9dc` | 67 focused units; 7 Recovery UI methods passed; 2,244 full iPhone units | Every Recovery production/test blob is byte-identical except generated project files, which intentionally include both reserved blocks. | Recovery UI passed again in the integrated `1b209ebf` run before its unrelated Energy failure. `ac3def4c` changes only `EnergyHistoryView.swift`. |
| Widget/theme `895e4a1e` | Widget 28/28 after amber follow-up; 2,238 full iPhone units on Option B source; theme units; Watch theme UI on both sizes | All shipping/test blobs are byte-identical except generated project files. | Generator conflict was resolved by retaining both `0x20FF` and `0x21FF`. No widget source conflict. Fresh full units and retained Watch gates cover integration. |
| Harness `a7e8a363` | one-pass iPhone 93/93; contamination-order 26/26; six vulnerable tests 6/6; Watch UI 10/10 both sizes; 2,224 full units | All three shipping harness blobs are byte-identical. Two test files are the intentional union with Logger tests and the Build 93 version expectation. | The DEBUG reset remains per-token, Sandbox-only and Founder-key preserving. Prior full-run proof is reusable; the full unit gate must rerun its exact isolation unit on final. |
| Integrated pre-fix `1b209ebf` | build-for-testing passed; 19 UI passed before one authoritative Energy failure; all 7 new Recovery methods completed before the stop | `ac3def4c` differs by **one production file only**, `EnergyHistoryView.swift` (4 insertions, 1 deletion) | No test-source or other product drift after the integrated run. |
| Energy fix `ac3def4c` | `EnergyRecoveryRedesignUITests.testEnergyEstimateWordingSheetsLinksAndBackTrail`: **1/1**, 275.268 s | Exact final SHA | Direct final-candidate proof; verifies root `Evidence Hub`, sheet-local `Daily Energy History`, return to the open sheet and direct `Energy` back trail. |

### Intentional merge resolutions

Only three composition areas need special treatment:

1. `TrainingAcceptanceUITests.swift` is the union of Logger's two new progression journeys and the harness's per-test Sandbox token in four UI classes. No assertion was weakened.
2. `TrainingLoggerTests.swift` is the union of Logger actionability coverage, the Sandbox/Founder isolation test and the Build 93 bundle-version expectation.
3. `generate_project.py` / `project.pbxproj` retain Recovery block `0x20FF`, theme block `0x21FF` and version **1.0 (93)**. Two final generations produced byte-identical SHA-256 `f38c5dd889f10a1453a8b0d181e4dd9c0260ef3a6c1a9f5dccf442e51c11ef53`; release configuration verification passed on final.

There was no manual product-code conflict between Home, Logger, Recovery, widget/theme or harness lanes. Held Energy-history work remains absent.

## Evidence matrix by release-critical behavior

| Coverage | Latest actual passing evidence | What changed afterward | Final-candidate confidence | Fresh requirement under the proposed alternative |
|---|---|---|---|---|
| Existing 93-test UI baseline and order isolation | `a7e8a363`: 93/93 one pass; 26/26 reproducing prior contaminating order | 11 Build 93 UI methods and their product lanes were added | Useful only for unchanged journeys; not a final-candidate pass | Rely on baseline for untouched journeys; run cross-feature and changed-surface matrix below |
| Morning `{label,destination}` and legacy `href` decoding | `89378f31`: complete `FounderServerAPITests` + Morning model suite inside 427/427 | No Morning blob changed | High source equivalence | Full final iPhone units must include canonical decode/fail-closed tests |
| Morning typed-weight loading/error/retry | `89378f31`: bounded auto retry, manual retry, typed-weight preservation, fresh-context guard | No Morning blob changed | High | Full units plus 3 fresh Morning/weight UI state journeys |
| Morning canonical persistence, occurrence binding and lost acknowledgement | `89378f31`: submit identity/revision, retry idempotency, canonical read, date/time-zone and lost-ack coverage | No Morning blob changed | High | Full final units; no real Founder write/backfill |
| Home odd-tail grid and Dynamic Type | `89378f31`: narrow + large device UI in both appearances | No Home blob changed | High source; no final integrated runtime pass | Run both exact Home layout UI methods fresh |
| Morning removes Complete but keeps Skip/navigation | `89378f31`: unit/capability and UI family checks | No Home blob changed | High source | Run priority-family and Morning atomic-action UI methods fresh |
| DEXA informational reminder, no Complete/Skip | `89378f31` Native + fresh Server candidate tests | No final Native DEXA blob changed; concurrent Claude DEXA Server recovery lane is separate and must not alter `ac3def4c` | High for Build 93 projection; unrelated Oct 9 processing incident remains separate | Run priority-family UI fresh; full Native units retain forged-action refusal. Do not incorporate the separate DEXA recovery candidate without a new diff-based gate decision. |
| Logger suggestion actionability | `f92f2291`: Dark and Mineral Light UI; focused actionability/unit suites | Shipping Logger blobs unchanged; harness tokens added to the same UI file | High product equivalence; moderate combined-harness risk | Run both progression UI journeys fresh and full units |
| Recovery Weekly/Monthly content and cadence exclusion | `766bd9dc`: all 7 UI; `1b209ebf`: all 7 again after integration | Only unrelated Energy view changed | High integrated evidence | Fresh OFF/no-card and Monthly adjacency sentinels; rely on integrated pass for expensive capture matrix |
| Energy nested back trail | exact final `ac3def4c`: 1/1 | Nothing | Highest available | Credit this exact final-SHA pass; do not rerun unless SHA changes or Founder requests it |
| Widget Option B and amber refresh/CTA | `895e4a1e` ancestry: 28/28 and source renders | Widget blobs unchanged; generator union only | High | Full final unit target must report all 28; widget Start/Resume deep-link UI sentinel fresh |
| Watch / Live Activity theme | `895e4a1e`: 76 Watch units, theme UI both sizes; Live Activity/theme units | Watch/theme blobs unchanged; harness stub added in separate Watch store blob | High per-lane, no final combined Watch pass | **Retain full final Watch units and all 11 Watch UI methods on both 42/49 mm**; this assessment does not reduce them |
| Watch fixture finish reliability | `a7e8a363`: 10/10 Watch UI both sizes | theme adds one independent UI method; Watch store blob unchanged | High | Retained full 11-method Watch targets combine both proofs |
| DEBUG harness exclusion | `a7e8a363` Release seam 0; Recovery candidate Release seam 0 | final generator/version union; no shipping fixture path added | High, but archive is the release artifact | Retain clean Release and archive-binary seam scans |
| Cross-feature root/navigation | baseline 93/93 and isolated Home/Logger/Recovery tests | lanes were combined linearly; global `AppEnvironment` harness init and `PhysiqueOSApp` activity theme wiring changed | Residual integration risk | Run combined root routes in Dark and Mineral Light fresh |

## Proposed replacement iPhone UI matrix

This is a proposal only. If approved, run the following **12 tests in one non-parallel `test-without-building` invocation** against one freshly created/erased iPhone 17 Pro simulator and one exact final-SHA DerivedData build:

### Home, Morning Weight and DEXA — 5

1. `PhysiqueOSUITests/FoamRollingPriorityDetailUITests/testPriorityFamilyVariantsRenderTheirLockedActionsOnly`
2. `PhysiqueOSUITests/FoamRollingPriorityDetailUITests/testMorningCheckInLockedDispositionsAndAtomicAction`
3. `PhysiqueOSUITests/FoamRollingPriorityDetailUITests/testManualWeightRevealsReturnToLogOnlyAfterADurableSave`
4. `PhysiqueOSUITests/FoamRollingPriorityDetailUITests/testHomeOddFinalPrioritySpansTheBottomRowInDarkAndMineralLight`
5. `PhysiqueOSUITests/FoamRollingPriorityDetailUITests/testHomeAccessibilityDynamicTypeUsesReadableSingleColumnPriorities`

### Logger and widget-to-Logger boundary — 3

6. `PhysiqueOSUITests/LoggerParityCaptureUITests/testProgressionSuggestionActionabilityDark`
7. `PhysiqueOSUITests/LoggerParityCaptureUITests/testProgressionSuggestionActionabilityMineralLight`
8. `PhysiqueOSUITests/TrainingAcceptanceUITests/testHomeWidgetStartAndResumeLinksOpenTheLoggerWithoutCreatingAWorkout`

### Cross-feature navigation — 2

9. `PhysiqueOSUITests/Build89IntegrationUITests/testCombinedRootReviewRoutesDark`
10. `PhysiqueOSUITests/Build89IntegrationUITests/testCombinedRootReviewRoutesMineralLight`

These launch the combined root, Morning Check-In and briefing/DEXA routes through the final app shell in both appearances.

### Recovery integration sentinels — 2

11. `PhysiqueOSUITests/BriefingRecoveryAcceptanceUITests/testNoRecoveryAnywhereWithoutAPublishedCard`
12. `PhysiqueOSUITests/BriefingRecoveryAcceptanceUITests/testMonthlyCardSitsBetweenEnergyAndNewBaselineWithWeeklyAggregates`

The first proves the normal absent/OFF presentation. The second covers the highest-value cross-section ordering seam without rerunning the approximately ten-minute 12-scenario Recovery screenshot capture. The full seven-test Recovery UI evidence at integrated `1b209ebf` remains the basis for the other Recovery journeys.

### Exact final-SHA pass credited, not repeated

`EnergyRecoveryRedesignUITests.testEnergyEstimateWordingSheetsLinksAndBackTrail` already passed 1/1 on exact `ac3def4c`. It remains part of the acceptance ledger. If `ac3def4c` changes for any reason, this credit expires and the test must run again.

## Unit/Watch/release gates that the alternative does not reduce

The proposed substitution affects only the full iPhone UI target. It retains:

- full final `PhysiqueOSTests`, with explicit extraction of Morning context/retry/idempotency, DEXA refusal, Logger actionability, Recovery card, Widget 28/28, Live Activity/theme and Sandbox isolation results;
- full final Watch unit target;
- all **11** final Watch UI methods on both 42 mm and 49 mm;
- deterministic generation, `0x20FF`/`0x21FF`, clean diff, version 1.0 (93), release-configuration verification;
- clean generic Release, DEBUG/review-fixture seam scans, signing/archive/export and guarded upload dry run;
- every Server gate, guarded deployment fence, health/readiness check, Recovery OFF proof and TestFlight VALID requirement from the existing authority.

No assertion may be changed, skipped or retried away. Any selected-test failure, crash, unexpected test count, SHA drift or capacity breach stops the release.

## Time and disk comparison

### Observed facts

- Claude's 93-method full iPhone UI pass took approximately **87 minutes**.
- Final Build 93 has 104 methods, including the Energy journey measured at **275.268 seconds** and the Recovery capture test that was still running after **579 seconds** in the latest measured attempt.
- The prior complete iPhone gate consumed approximately **5.09 GiB** transiently.
- The latest cold final-candidate build plus only the opening portion of UI consumed approximately **7.10 GiB** from Native preflight to stop; cold `build-for-testing` alone consumed approximately **5.25 GiB**.
- Live availability at assessment preflight was **20,138,288 KiB (19.21 GiB)**.

### Estimated alternative

| Item | Full current target | Proposed evidence-based alternative |
|---|---:|---:|
| iPhone UI methods newly executed | 104 | 12, plus credit for exact-final Energy 1/1 and prior mapped evidence |
| UI runtime | approximately 95–110 min (93-method run was 87 min; final adds 11) | approximately **25–40 min**, with a 45-minute operational ceiling |
| Time saved | — | approximately **55–85 min (about 58–77%)** |
| UI-stage transient | prior comparable full gate ~5.09 GiB | estimated **1.5–2.0 GiB**; not yet measured, so treat as a budget, not a fact |
| Cold build transient | ~5.25 GiB | ~5.25 GiB; unchanged |
| Conservative cold build + targeted UI budget | current attempt exceeded 7.10 GiB before finishing | **7.25 GiB**, plus 1.25 GiB uncertainty reserve |

The proposed lane should not start below **20.5 GiB** live free space: 12 GiB floor + 7.25 GiB stage budget + 1.25 GiB uncertainty. The current 19.21 GiB assessment reading is therefore **not sufficient**, even for the reduced matrix. Measure immediately before execution, serialize Xcode, warn at 13.5 GiB and stop gracefully before 13.0 GiB so the 12 GiB floor is never approached uncontrollably. Clean only the exact completed lane-owned simulator, DerivedData and result bundle after extracting evidence.

## Residual risks and stop conditions

| Risk not fully covered by the alternative | Mitigation | Residual level |
|---|---|---|
| A regression in one of the other 92 final UI methods | 93/93 baseline for unchanged journeys; blob-equivalent lane proofs; full units; selected cross-feature routes | Moderate; this is the principal tradeoff |
| Unknown cumulative state interaction outside the prior Training contamination | one fresh simulator, non-parallel single invocation, DEBUG per-test reset, prior 93/93 + 26/26 order proof | Low to moderate; targeted selection is not a full soak |
| Global app-shell wiring affects an unrelated route | Dark/Light combined-root tests and exact final Energy pass | Low, not zero |
| Test-target membership/generator resolution | deterministic final generator, both reserved blocks, final build-for-testing success, selected tests from every added file | Low |
| Expensive Recovery visual/capture regression | exact integrated seven-test pass at `1b209ebf`; Recovery source/test blobs unchanged in `ac3def4c`; two fresh sentinels | Low for behavior, moderate for uncaptured visual drift |
| Concurrent DEXA recovery candidate changes Server behavior | keep Claude's DEXA candidate separate; if merged/deployed before Build 93, invalidate relevant Server evidence and reassess | Controlled by SHA/deploy fence |

Mandatory stop/revert-to-full-suite conditions:

- Native SHA differs from `ac3def4c`, or any lane-owned blob no longer matches this reconciliation;
- Server candidate/deploy composition changes in a way that affects Native fixtures/contracts;
- any selected test or retained unit/Watch/release gate fails;
- selected UI result is not exactly 12/12, or exact-final Energy evidence cannot be verified;
- unexpected simulator/app state, order dependence, crash or runner hang;
- projected storage falls below the approved budget or approaches the 12 GiB floor;
- Founder declines the evidence substitution.

## Founder choice

### Option A — retain the whole-target gate

Require a fresh **104/104** one-pass iPhone UI result on `ac3def4c`. This has the lowest functional uncertainty but is presently unsafe under observed disk consumption and would likely take roughly 95–110 minutes after compilation.

### Option B — approve the scoped alternative (recommended under current storage constraints)

Accept:

1. Claude's `a7e8a363` 93/93 full-suite and harness-order evidence for unchanged journeys;
2. the mapped source-candidate passes whose shipping blobs are identical in final;
3. the exact-final `ac3def4c` Energy 1/1 pass;
4. a fresh final-SHA 12/12 matrix exactly as listed above;
5. every full unit, Watch, Server, Release, archive, signing and upload-readiness gate unchanged.

This option is objectively narrower while still exercising every Build 93 UI feature and the highest-risk integration seams. It knowingly trades away a fresh final-binary traversal of the other 92 UI methods. Approval must be explicit and should name this report; until then, Option A remains the binding gate and Build 93 remains unreleased.

## Safety and coordination

- No Xcode process was started; Claude's bounded DEXA Server candidate lane was not interrupted or modified.
- Native `ac3def4c` and Server `e03f6768` worktrees remained clean.
- Production writes/deployments, Recovery activation, historical replay, DEXA recovery execution and Founder-data reads/writes: **zero**.
- Archive/export/TestFlight attempts and release-pointer updates: **zero**.
- `agent-handoffs/latest.json`, `latest.md` and the backlog were not changed.
