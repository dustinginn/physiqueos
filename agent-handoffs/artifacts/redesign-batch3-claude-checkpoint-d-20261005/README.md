# Batch 3 · Checkpoint D: Progress Photos + DEXA Evidence (Claude)

- **Native:** `9d2d0e06` on `claude/redesign-batch3-evidence-takeover-20261005`. The base is accepted A/B/C, `8aa2d00b`.
- **Task:** prompt `28cbb4dd`.
- **Locked authority:**
  - `47ed6d1a` (P1–P6, D1–D10);
  - the final Since Prior Scan correction in `f208007c`.
  - The Evidence family is LOCKED.

## Start here

| File | What |
|---|---|
| `checkpoint-d-primary-mobile-review-board.png` / `-light.png` | Curated mobile board: P1, P3, P5, D1, Since Prior Scan, D2 (reference vs simulator) |
| `photos-dark-reference-vs-simulator.png` / `photos-light-…` | P1–P6, every Photos surface |
| `dexa-dark-reference-vs-simulator.png` / `dexa-light-…` | D1, D2, D3, D4, D6, D8, D10 |
| `since-prior-scan-dark-light.png` | Since Prior Scan, both appearances |
| `dexa-chart-gesture-proof.png` | The chart fix, from the passing UI test |
| `media-states-dark-light.png` | Locked P6 tile states: loading, couldn't load + Try again, unavailable |
| `synthetic-media-image-path.png` | Real image path with synthetic review media |
| `PARITY-NOTES.md` | Method, measured residuals, truthful differences, interpretation decisions |
| `FOUNDER-PHOTO-VALIDATION.md` | Real Founder photo status (not performed; why; how to finish) |

## Result

Photos and DEXA are implemented on a new EvidenceKit `record` family: the 360-px SF Pro harness with its exact dark and Mineral Light tokens.

Measured residuals (dark and light identical):

| Area | Residual (pt) |
|---|---|
| Headers and scope | ±0.3 |
| Latest Photo Set | ≤ 0.4 |
| Photo Set detail | ≤ 1.4 |
| DEXA Latest Scan → metrics | ≤ 0.5 |
| Scan History | ≤ 1.3 |

Lower-section offsets come from truthful Sandbox content: the phase pill row, the optional weight line, and the PDF action that Sandbox lacks.

**Fixed:** the DEXA chart vertical-scroll trap. A tap selects, a horizontal-only pan scrubs, and a vertical swipe scrolls the page. A UI test proves all three.

**Not broadened:** Energy and the Weekly/Monthly Briefings still use the old overlay. They stay as follow-ups for their owning families.

## Preserved

- Pose order and the date mapping by stable view identity.
- Staged upload/processing: unchanged.
- The shared inspector's zoom/pan/page/dismiss behavior. Briefing keeps its standard chrome.
- Photo Briefing published/pending/unknown semantics.
- DEXA units and data authority; the PDF only where media exists.
- Apple Health writeback (coordinator states and Retry).
- Each disclosure's independent state.
- Loading, failure and empty states.
- Accessibility identities, with 44-pt targets.

No Server change. Checkpoints A, B and C are untouched except the opt-in `EvidenceHeaderView(exposesTexts:)`; the Hub and Timeline keep the default.

## Tests

| Run | Result |
|---|---|
| Focused unit tests (Training, Activity, Nutrition, Weight, HealthKit fidelity, Evidence, SharedUI, AppTab, Recovery, Chart, Reconciliation, DEXA, DEXA writeback, DEXA Briefing, Photos, Photo Briefing, inspector, processing, pose contract, staged intake) | 573 run, 0 failures (1 pre-existing skip) |
| `EvidencePhotosDEXAUITests` (new) | 3/3: Photos detail/pager/Source History/inspector; DEXA order and four disclosures; chart tap/scrub/vertical scroll |
| B/C `EvidenceTrainingNutritionWeightUITests` | 11/11 |
| A `EvidenceHubTimelineUITests` | 3/3 |
| `RecoverySleepAcceptanceUITests` | 3/3 |
| Training acceptance: Library, Reporting, Recent History, Corrected Evidence (walks DEXA + Photos) | Pass |
| `testBriefingParityJourneys` | Fails: "The current Briefing was not available from Home". It fails identically on accepted base `8aa2d00b` (built from an exported tree), so it pre-dates D. It is a Home Briefing-card issue outside D |
| Re-run after the final wrap fix: `EvidencePhotosDEXAUITests`, Corrected Evidence journey, Evidence + inspector unit tests | All pass |
| Generic iOS Release compile | Passed. App, Watch and Live Activity embedded; zero review-seam or synthetic-media strings in the binary |

Public media is synthetic or neutral art only. No Founder photo bytes were read or committed.
