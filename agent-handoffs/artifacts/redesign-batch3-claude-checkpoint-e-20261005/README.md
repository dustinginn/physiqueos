# Batch 3 · Checkpoint E: Add Evidence + generic Evidence Review (Claude)

- **Native:** `44609af1` (code; this package commit follows it) on `claude/redesign-batch3-evidence-takeover-20261005`.
  - The base is accepted A–D (`9d2d0e06`, D visually accepted).
  - E code: `ce9dd214` + `44609af1`.
- **Task:** prompt `387bbdb9` (`20261005T221500Z-batch3-d-accepted-final-e-dexa-proof.md`).
- **Locked authority:** Final Design Batch 1, Evidence Intake + Review (`85ef2a6c`, `evidence-workflow-harness.html`).

## Start here

| File | What |
|---|---|
| `checkpoint-e-primary-mobile-review-board.png` / `-light.png` | Curated board: chooser, Automatic grouped result, Nutrition manual, DEXA selected, generic review, DEXA correction (reference vs simulator) |
| `add-evidence-reference-vs-simulator.png` / `add-evidence-light-…` | Every Add Evidence surface vs its locked reference, Dark and Mineral Light |
| `evidence-review-reference-vs-simulator.png` / `evidence-review-light-…` | Generic review (mixed, photo, DEXA), correction |
| `intake-states.png` / `-light.png` | Classifying, uploading, processing, accepted → Review, confirmed, failed + retry, DEXA error, Photos review/ready/resume/rejected/uploading/received, manual Activity, single-type handoffs |
| `review-states.png` / `-light.png` | Loading, read failure, not found, saving, confirming, still confirming, refresh required, dismissing, dismissed, accepted, confirmed, failed + Try Again, every status |
| `generic-vs-workout-match-routing.png` | Generic workflow vs Workout Match on this branch **and** on the integration preview, where Batch 2's L13 renders |
| `PARITY-NOTES.md` | Method, measured residuals, truthful differences, the behavior defect fixed |
| `DEXA-REGRESSION-INVENTORY.md` | DEXA condition from D acceptance: 20 items, present / route / data / test |
| `INTEGRATION-MAP.md` | Exact merge map against `793462b1`, `e9f8a957`, `70ebf753` and the Batch 2 Workout Match branch |

The reference Photos intake screens contain a real Founder photo. It is **redacted** in every board. The simulator uses synthetic mannequin media.

## Result

- **Add Evidence:** `ProductionEvidenceUploadView` is re-presented on a new EvidenceKit `workflow` family (402-px SF Pro, exact `.phone` / `.phone.light` tokens).
  - The generic chooser, Progress Photos and DEXA Scan intake are covered.
  - Submission, classification, staged Photos transport and manual upsert code are unchanged.
- **Generic Evidence Review:** every review except Workout Match (Nutrition, Activity, Training, Weight, Progress Photos, DEXA, mixed) uses the locked review.
  - Review elements: gradient hero, captured-evidence items, metric tiles, Correct Measurements / Confirm / Dismiss, lifecycle cards.
- **Workout Match:** not redesigned. `EvidenceReviewPresentationRoute` sends every `workoutReconciliation` review to the **unchanged** Build 87 branch. In the release merge, that branch holds Batch 2's L13 (see `INTEGRATION-MAP.md`).
- **Residuals:** ≤ 2.0 pt across all measured E surfaces. The review hero bottom is 0.0. See `PARITY-NOTES.md`.
- **Behavior fix:** DEXA correction pre-filled rounded values (`0.24` → `0.2`). On a full-replacement save, that silently rounded untouched fields. It now pre-fills exact values (tested).

## Tests

| Run | Result |
|---|---|
| Unit: 37 suites (Evidence read model / chronology / hub, Review header + routing + correction, attachment content-type probe, Training ×10, Activity, Nutrition ×3, Weight, DEXA ×3, Photos ×4, pose contract, staged intake, Recovery ×2, Sleep evidence, HealthKit fidelity, Chart, SharedUI, AppTab, Reconciliation) | **831 passed, 0 failed** (1 skipped) |
| `EvidenceIntakeReviewUITests` (E, new): chooser + manual + handoffs; DEXA/Photos gates; generic review + correction; read/lifecycle states; **Workout Match routing** | **5/5** |
| `EvidencePhotosDEXAUITests` (D + **DEXA regression inventory**) | **4/4** |
| `EvidenceTrainingNutritionWeightUITests` (B/C regression) | **11/11** |
| `EvidenceHubTimelineUITests` (A regression) | **3/3** |
| `RecoverySleepAcceptanceUITests` | **3/3** |
| `TrainingAcceptanceUITests`: Evidence journeys (corrected evidence, date picker, recent history → correction, reporting, library, production page, Home confidence) | **7/7** |
| `TrainingAcceptanceUITests`: Home Briefing ×3 and Log → Logger ×6 | 9 fail: **pre-existing**. The accepted base `8aa2d00b` fails the same 9 with identical messages. They are the Build 87 failures the Batch 2 ledger records. Batch 2 `b1488c2e` fixes the Briefing three on integration; the Logger six are order-coupled. Batch 3 changes no Home, Log or Logger code |
| Generic iOS **Release** compile (`generic/platform=iOS`) | **Succeeded.** Embeds `PhysiqueOSWatch.app` and the WidgetKit extension (Live Activity + widget); **0** Debug seam strings |
| `generate_project.py` | Byte-stable (no diff) |
| Integration preview tree `41ba03dd` (Batch 3 + `70ebf753`, resolved) | Built. Header/routing unit 13/13; Batch 2 `testCheckpoint5WorkoutMatchDark` passed; E routing + generic review UI passed |

## Not changed / out of scope

- No Server change. Nothing in the workout reliability lane was touched.
- No TestFlight upload, no build bump, no merge.
- Charts: no Energy/Briefings broadening.
- The Sandbox-only `EvidenceIntakeView` / `LocalEvidenceReviewView` are unchanged; the locked design covers the production flow, which Sandbox renders through a Debug seam.
