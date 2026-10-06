# Redesign Batch 3 · Checkpoint E + final Batch 3 closeout (Claude)

- **Task:** `batch3-d-accepted-final-e-dexa-proof-20261005` (prompt commit `387bbdb9`). D was visually accepted, conditional on the DEXA regression proof. A, B and C are locked.
- **Status:** E implemented, pixel-audited and tested. The DEXA proof is complete and the final Batch 3 gates have run. **STOPPED for final Founder review.** No TestFlight upload, no build bump, no merge.
- **Generated (UTC):** 2026-10-05T23:58:40Z

## Final Batch 3 Native authority

| Item | SHA |
|---|---|
| **Final Batch 3 Native** | **`f5257ae1`** (`f5257ae1013dbb04e996bab27e144201b84da8b7`) on `claude/redesign-batch3-evidence-takeover-20261005` (pushed). Last code commit: `44609af1` |
| E code | `ce9dd214` + `44609af1` |
| E review package | `f5257ae1` |
| Locked E design | `85ef2a6c` (Evidence Intake + Review, `evidence-workflow-harness.html`) |
| Base | Build 87 `f66c7fc6` + inherited Home parity `49e48f1e` |

## A–E status

| CP | Scope | Native | Status |
|---|---|---|---|
| A | Evidence Hub + Timeline | `ce5c7dd8` | Accepted, locked |
| B | Training + Activity/Cardio (+ icon correction) | `8aa2d00b` | Accepted, locked |
| C | Nutrition + Weight | (with B) `8aa2d00b` | Accepted, locked |
| D | Progress Photos + DEXA | `9d2d0e06` | Visually accepted. **DEXA condition is now proven** (below) |
| E | Add Evidence + generic Evidence Review | `44609af1` | **Ready for final review** |

## Review links (all at `f5257ae1`)

**Primary mobile board**
- Dark: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/checkpoint-e-primary-mobile-review-board.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/checkpoint-e-primary-mobile-review-board-light.png

**Add Evidence**
- Dark: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/add-evidence-reference-vs-simulator.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/add-evidence-light-reference-vs-simulator.png

**Generic Evidence Review, incl. correction**
- Dark: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/evidence-review-reference-vs-simulator.png
- Mineral Light: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/evidence-review-light-reference-vs-simulator.png

**Processing / error / retry / accepted states**
- Intake, Dark: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/intake-states.png
- Intake, Light: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/intake-states-light.png
- Review, Dark: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/review-states.png
- Review, Light: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/review-states-light.png

**Generic vs Workout Match routing, incl. the integration preview**
- https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/generic-vs-workout-match-routing.png

**Notes**
- Parity notes: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/PARITY-NOTES.md
- DEXA regression inventory: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/DEXA-REGRESSION-INVENTORY.md
- Integration map: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/INTEGRATION-MAP.md
- Package README: https://github.com/dustinginn/physiqueos/blob/f5257ae1013dbb04e996bab27e144201b84da8b7/agent-handoffs/artifacts/redesign-batch3-claude-checkpoint-e-20261005/README.md

## E result

**Add Evidence.** `ProductionEvidenceUploadView` is now presented on a new EvidenceKit `workflow` family (402-px SF Pro, exact Dark and Mineral Light tokens). It covers:
- the chooser;
- the Automatic grouped result with per-file type;
- Nutrition and Activity manual entry;
- single-type handoffs;
- DEXA empty / selected / validation error;
- Progress Photos review / ready / resume / rejected / uploading / received;
- classifying / uploading / processing / accepted → Review / confirmed / failed + Try Again.

Submission, classification, staged transport and manual-upsert code are unchanged.

**Generic Evidence Review.** Every non-Workout-Match review uses the locked review: gradient hero, captured-evidence items with metric tiles, Correct Measurements (DEXA full replacement) / Confirm / Dismiss, and lifecycle and read states.

**Measured residuals:** ≤ 2.0 pt on every measured surface, Dark and Light. The review hero is exact.

Defects found while measuring and fixed:
- the hero ring took part in layout (+15.7 pt);
- a missing section margin;
- a duplicated meal margin;
- missing file-row rules;
- six early label wraps (a Spacer in a spaced HStack).

**Behavior fix.** On Build 87, DEXA correction pre-filled rounded values (`0.24` → `0.2`), and a full-replacement save silently rewrote untouched fields. It now pre-fills exact values; a unit test covers it.

**Truthful differences** (detailed in the parity notes):
- The DEXA error shows only the Server message.
- The accepted state also keeps Return to Log.
- The Photos resume card sits above the form.
- Server metrics own the DEXA tiles.
- Remove is an accessibility / context action.
- The reference Founder photo is redacted; the simulator uses synthetic media.

## Workout Match protection

- `EvidenceReviewPresentationRoute` sends every `workoutReconciliation` review to the **unchanged** Build 87 branch. Batch 3 never restyles it.
- In the release merge that branch auto-merges with Batch 2 L13 `79a1a33d`, so Workout Match renders L13.
- Proof:
  - the unit test `testOnlyWorkoutReconciliationRoutesAwayFromTheGenericReview`;
  - the UI test `testWorkoutMatchKeepsItsOwnBranchWhileGenericUsesTheWorkflow`;
  - on the resolved preview tree `41ba03dd`: Batch 2 `testCheckpoint5WorkoutMatchDark` passed, and the routing board shows L13.

## DEXA regression proof (D acceptance condition)

I audited Build 87 → D line by line; see the inventory. All 20 items are present, with routes, data and actions preserved. **Nothing was dropped.**

- 4 independent disclosures and 17 graphs.
- Supplemental: 3 → 9 rows, 2 graphs.
- Regional Lean: 3 → 5 rows, 5 graphs. Regional Fat: 3 → 5 rows, 5 graphs.
- History: 3 → all.
- The PDF routes (latest and per-scan), Apple Health writeback + Retry, scope, Since Prior Scan, the 5 core trends with tap/scrub/vertical scroll, and the empty/loading/failure states are all kept.

Build 87 has no DEXA scan-detail route. Correction lives in the pending DEXA review, which E now covers.

Tests:
- `testDEXARegressionInventoryEveryDisclosureKeepsAllRowsAndGraphs`;
- `testDEXAOrderAndEveryIndependentDisclosure`;
- `testDEXAChartTapScrubAndVerticalScroll`;
- `testCheckpointDPageInventoryKeepsEveryCanonicalSection`;
- the DEXA writeback, read-model and Briefing suites.

All pass.

## Tests and Release (final Batch 3 gates on `44609af1`)

| Run | Result |
|---|---|
| Unit, 37 suites (Evidence, Review, Training, Activity, Nutrition, Weight, DEXA, Photos, pose, staged intake, Recovery, Sleep evidence, HealthKit fidelity, Chart, SharedUI, AppTab, Reconciliation) | **831 passed, 0 failed** (1 skipped) |
| `EvidenceIntakeReviewUITests` (E) | 5/5 |
| `EvidencePhotosDEXAUITests` (D + DEXA inventory) | 4/4 |
| `EvidenceTrainingNutritionWeightUITests` (B/C) | 11/11 |
| `EvidenceHubTimelineUITests` (A) | 3/3 |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| `TrainingAcceptanceUITests`, Evidence journeys | 7/7 |
| `TrainingAcceptanceUITests`, Home Briefing ×3 + Log → Logger ×6 | 9 fail: **pre-existing**. Base `8aa2d00b` fails the same 9 with identical messages; they match the Build 87 ledger. Batch 2 `b1488c2e` fixes the Briefing three on integration. Batch 3 changes no Home, Log or Logger code |
| Generic iOS **Release** compile | **Succeeded**: Watch app + WidgetKit extension (Live Activity + widget) embedded; 0 Debug seam strings |
| `generate_project.py` | Byte-stable |

## Exact integration map (no merge performed)

| Merge (Batch 3 `44609af1` ×) | Conflicts | Resolution |
|---|---|---|
| Clean Batch 2 RC `793462b1` | **1**: `ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift` | Take the release side verbatim (blob `95cb0848` = `49733300` + `b1488c2e` `home.latestBriefing`). Batch 3 only inherited `49e48f1e` (byte-equal to `49733300`) |
| Workout reliability `e9f8a957` | **0** | — |
| Integration preview `70ebf753` | **1**: the same file | `git checkout 70ebf753 -- ios/PhysiqueOS/Presentation/Home/HomeJourneyFieldView.swift` |
| Batch 2 Workout Match L13 `79a1a33d` | **0** | `EvidenceReviewDetailView.swift` auto-merges: L13 nests inside Batch 3's untouched Workout Match route |

Shared files that auto-merge:
- `EvidenceReviewDetailView.swift`;
- `ProductionDailyDriverAPI.swift`;
- `HomeView.swift`;
- `FounderServerAPITests.swift`;
- `FoamRollingPriorityDetailUITests.swift`.

All except the first come only from the inherited Home parity commit.

Resolved local preview tree `41ba03dd` (not pushed):
- no markers;
- generator byte-stable;
- built;
- header/routing unit tests 13/13;
- Batch 2 L13 test passed;
- E routing and generic UI tests passed.

The workout reliability lane, Server `b7eb1e39` and deployment `6fa4e887` were not touched.

## Unresolved items

1. Real Founder Progress Photos were not validated (synthetic fixtures, per instruction). Validate on device after TestFlight.
2. The Energy and Weekly/Monthly Briefing charts still use the old overlay. Their owning families will follow up (not broadened, per instruction).
3. Nine pre-existing `TrainingAcceptanceUITests` failures. Briefing ×3 is fixed by Batch 2 on integration. The Logger journeys ×6 are order-coupled (Build 87 ledger).
4. The Sandbox-only `EvidenceIntakeView` / `LocalEvidenceReviewView` keep their Build 87 presentation; the locked design covers the production flow.

## Next (requires Founder authorization)

1. Final review of E and Batch 3.
2. Authorize the multi-lane merge per the map: `70ebf753` + Batch 3 `f5257ae1`, resolving `HomeJourneyFieldView.swift` with the release side.
3. Gates, build bump and TestFlight.

No TestFlight upload, no build bump, no release merge.
