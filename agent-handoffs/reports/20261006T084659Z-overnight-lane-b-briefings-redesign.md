# PhysiqueOS Overnight Lane B — Briefings redesign (presentation migration)

Task: `overnight-claude-b-briefings-redesign-20261006` (prompt `agent-handoffs/inbox/prompts/20261006T052200Z-overnight-claude-b-briefings-redesign.md`, authority commit `c26782a8`).
Status: **READY FOR FOUNDER REVIEW. Not Founder-accepted.** No checkpoint is marked accepted.

## Candidate

| Item | Value |
|---|---|
| Base | Build 88 `7fce3b9708c063f3c6b58571778c595012b5de6d` (VALID in TestFlight) |
| Branch | `claude/overnight-lane-b-briefings-redesign-20261006` (pushed, not merged) |
| Candidate SHA | `8d085cbbd28a289baeaa3a17abf062e454442fb6` |
| Checkpoint commits | B1+B2 `ad8a561a` · B3+B4 `c3c5966b` · B5 `511bc4b2` · B6 real-record fixes `08408b81`, `828ddb6b`, test `8d085cbb` |
| Build number | unchanged (88). No TestFlight upload, no Server change or deploy, no production mutation. |
| latest.json / latest.md | untouched (still Build 88). This is a report-only publish. |

## What was implemented

All of it is presentation. No Server engine, cadence, eligibility, payload or publication logic changed, and nothing regenerates a briefing.

- **Shared Briefing kit** (`SharedUI/BriefingPresentation.swift`):
  - the locked tokens: Dark, Mineral Light, and the accepted rich Mineral Light fields;
  - Plus Jakarta text styles with exact CSS line boxes;
  - CSS-geometry gradients;
  - the 44 pt Home / Briefing History chips;
  - the immersive hero (ring, confidence, headline, footer);
  - dense analytical sections, the navy Coach's Take finale and the revision disclosure;
  - the state view;
  - UILabel-backed greedy paragraphs, so every wrap matches the locked Chrome render.
- **Briefing Detail** (`BriefingDetailView.swift`):
  - locked chips and the page canvas, with no system nav bar;
  - the interactive back swipe is preserved;
  - every state is restyled: loading, unavailable, not ready (Check Again) and failed (Try Again);
  - one renderer routes Weekly, Midweek, Monthly, DEXA and Photo.
- **Briefing History:** Final Design Batch 2, in all four states (populated, loading, empty, failed). Rows keep Server order and open the published artifact by `artifactId`.
- **Weekly:** Hero → Energy → Weight → Body Composition → Training → Coach's Take (Into Next Week).
  - The recurring Photos card and "Still Unresolved" are removed; both are locked omissions.
  - Recovery is not rendered because the contract carries none (the 14-night rule).
- **Midweek:** the contract decides which modules appear and in what order.
  - Biggest Takeaway is the canonical Narrative V3 coachTake, used when the contract suppresses its own slot.
  - When the Server published no weight narrative, the weight note states the canonical basis instead (window weekdays plus the module's `observationCount`).
  - No Still Unresolved section and no Sleep card.
- **Monthly** (zine-like, corrected lock):
  - The Goal/Phase tags under the lead are removed; Goal/Phase stays in the accessibility hint.
  - Sections: three canonical highlights, Training record rows, the Energy Evolution field (canonical averages plus static weekly bars, with missing weeks shown as "not shown"), New Baseline ("What it means", no "read" label), What Changed, Defining Moments, then Coach's Take immediately before a numbered Month Ahead.
- **Photo** (the five-section production flow):
  - canonical pose labels and every pose;
  - Previous/Current comparisons with captions.
  - Interaction: session poses keep the shared single viewer. A comparison opens the **new paired Previous/Current viewer**, which the Oct 4 lock marked required. It is one zoomable plane, so pinch and pan stay synchronized; it also supports double-tap, Reset zoom, an accessible zoom value and swipe-down dismiss.
- **DEXA:**
  - the persisted Confidence ring and the canonical result grid;
  - all 17 unit rows (Since Last Scan, Regional Fat, Measured Lean Tissue, Other Notable Changes);
  - the restored Goal/Phase body-composition breakdown;
  - interpretation plus an evidence note;
  - Coach's Insight rows, the read-only Phase Review and the handoff;
  - the amber event revision note.
- **Chart gestures:** the legacy zero-distance `chartScrub` is gone from all Briefing files.
  - The Weekly and Midweek Energy bars use the corrected Evidence arbitration: tap selects, horizontal pan scrubs (the shared `EvidenceHorizontalScrubGesture`), and vertical movement scrolls.
  - Monthly bars and the DEXA breakdown stay static, as locked. No chart data changed.

## Checkpoint review boards

Root: `agent-handoffs/artifacts/overnight-lane-b-briefings-redesign-20261006/`. Every board shows the locked reference on the left and the shipping SwiftUI on the right (iPhone 17 Pro simulator, iOS 27, 402 pt / 3×). Sandbox fixture and synthetic mannequin media only; no Founder data.

| Checkpoint | Boards |
|---|---|
| B1 shared chrome + History | `history-loaded-{dark,light}.png`, `history-states.png`, `detail-states.png` |
| B2 Midweek + Weekly | `weekly-{dark,light}.png`, `midweek-{dark,light}.png` |
| B3 Monthly | `monthly-{dark,light}.png` |
| B4 Photo | `photo-{dark,light}.png`, `photo-paired-viewer.png` |
| B5 DEXA | `dexa-{dark,light}.png` |
| B6 compatibility + package | this report |

### Pixel-parity results

Method: each locked section was matched in the Native capture at its own position and compared by section height, then line by line.

| Surface | Max section |Δheight| (pt) | Notes |
|---|---|---|
| Weekly dark / light | 1.3 / 4.3 | Text wraps identical to the lock. Light finale −4 pt is CoreText vs Chrome line rounding inside the rich field. |
| Midweek dark / light | 1.5 / 2.2 | Identical wraps. |
| Monthly dark / light | 3.3 / 3.3 | Lock rendered without the elements the contract lacks (see below). |
| Photo dark / light | 1.3 / 0.9 | |
| History (failed / empty) | ≤2 | |
| DEXA | visual | No exact-content measurable lock harness exists for the corrected tables. Reviewed against the locked event render plus the flow-confirmation unit and phase screens. |

Known residuals (sub-4 pt):
- the event hero and the History state glyphs differ by about 2 pt in glyph baseline;
- the light-mode Weekly finale is about 4 pt shorter.

## The five real records for physical comparison

All five were identified read-only. Ids and dates only; no content is reproduced.

| Type | Canonical artifact id | Version | Published (UTC) |
|---|---|---|---|
| Midweek | `midweek_briefing_user_founder_001_20260927_20260929` | v3 | 2026-09-30T14:54:55Z |
| Weekly | `weekly_briefing_2026-09-27_2026-10-03` | v1 | 2026-10-04T14:31:46Z |
| Monthly | `monthly_briefing_user_founder_001_202609` | v2 | 2026-10-01T14:10:00Z (delivery 2026-10-01) |
| Photo | `event_briefing_progress_photo_photo_session_user_founder_001_2026-09-19` | v6 | 2026-09-20T17:51:47Z |
| DEXA | `dexa_event_evidence_submission_44462ABB3969473DA82FBF2B46A504EF_pdf_1_2026_09_12` | v10 | 2026-09-13T06:28:58Z |

**How they resurface (safe path):** nothing new is needed.
- All five are already published canonical artifacts in Briefing History.
- In the next integrated build, Briefing History lists them and a tap opens each through the normal `briefing` read by `artifactId`. They then render through the new presentation.
- No duplicate artifact is created, nothing is republished, and no timestamp or content is touched.

**Compatibility proof (pre-ship):**
1. Each record's payload was fetched read-only (SELECT only, inside `BEGIN … READ ONLY`, then ROLLBACK) on production web runtime `b7eb1e39`.
2. The production Server's own native projection (`BriefingNavigationReadService.getNativeArtifact` at `b7eb1e39`) was run locally over those rows to produce the exact `briefing` read payload.
3. Each payload was decoded by the shipping `ProductionBriefingMapper` through a DEBUG-only fixture-file seam and rendered on the simulator in Dark and Mineral Light.

All five render. Payloads and renders stayed in a private job directory and were not published.

Defects found by the real records, fixed presentation-only:
- **Midweek, Body Composition missing.** The contract includes the Body Composition module, but the mapper read `bodyComposition.newScan`, which is the boolean `false`, before `baseline`. So the section silently disappeared. This was also true on Build 88. It is fixed in the mapper, with a test.
- **DEXA, RMR unit duplicated** ("cal/day cal/day"). The production value already carries its unit.
- **DEXA, placeholder Goal title.** The artifact has no persisted `goalContext`, so the mapper's "Goal at publication" placeholder is now never shown as a Goal.

### Missing presentation fields (reported, not invented)

**Monthly.** The locked design shows five elements the current Native contract does not carry. They are omitted.

| Locked element | Current Native contract | Canonical payload |
|---|---|---|
| "3 of 4 weeks" new-bests summary | not mapped | No week distribution in `monthlyPresentation.training.stats` |
| Per-record before→current rails | not mapped | Only a text detail |
| Readable days / Target KPIs | not mapped | Target exists only at `narrativeV3.energy.strategy.intakeTarget`; readable days would have to be derived from `energy.dailyWeeks` |
| Two-endpoint scale rail | not mapped | Values exist only inside narrative prose |
| "Current strategy · …" tag | not mapped | The raw `recommendation.action` enum is engine copy (Founder: no technical engine copy) |

Instead, the Energy KPI row shows the canonical Avg intake, Avg expenditure and Avg balance. Adding any of the five locked elements needs an additive Server presentation field.

**Weekly:**
- No Recovery: the contract has none until the 14-night rule.
- The real record publishes no weight narrative, so the Weight section shows the value and delta only.

**DEXA:** the real Sep 12 artifact has no persisted `goalContext`. The breakdown therefore shows the canonical label ("Since Starting Lean Mass Build"), dates, elapsed days, scan count and metrics, but no Goal / Active phase row.

**Photo:** real media cannot be shown on the simulator (Production pairing is forbidden). The tiles show the neutral record art. The next physical build validates real media and the paired viewer.

## Proof that no briefing was regenerated

- Native: the new tests assert that every Briefing presentation file contains no command, regenerate or republish path. Detail uses only `fetchBriefing(artifactId:)` and History only `fetchHistory()`.
  - `testRenderingEveryBriefingLeavesItsCanonicalPayloadByteIdentical` renders all 13 bundled artifacts in both appearances and asserts each payload is byte-identical afterwards.
- Production (read-only before/after):
  - The five records keep the same md5, version and updated_at as when first read: `16e0b4c4…`/v3, `d52b05d9…`/v1, `3b459329…`/v2, `04837988…`/v6, `4cc6fc0d…`/v10.
  - Whole briefing collection: 57 records, last write `2026-10-04 14:32:20Z`, which is before this lane began (collection digest `edfee4b5…`). No briefing was written, regenerated or republished during the lane.
- No Server code changed in this lane, and no deploy or command ran.

## Tests

| Gate | Result |
|---|---|
| Full Native unit suite | **2086 tests, 0 failures** on the final SHA (1 pre-existing local-only skip, `testLiveFounderProductionCaptureDecodesAndAdapts`). Build 88 had 2066. |
| New `BriefingLockedPresentationTests` | 20+ tests: routing (all 5 types), payload identity, read-only, locked omissions, Midweek finale and weight basis, confidence copy, signed formatting, hero range, gesture arbitration (no `chartScrub`; tap + horizontal pan), bar nearest-day selection, History symbols and timestamps, every Detail/History state in both appearances, rich-field tokens, 44 pt targets, DEBUG-only seams, Monthly structure + mapper, paired-viewer request, DEXA units/RMR/goal placeholder, Midweek body-composition fallback |
| Briefing UI journeys + Home + Photo/DEXA regression | **11/11 pass:** `testBriefingParityJourneys` (DEXA → Monthly → Midweek → Weekly → Photo through History; memory says it failed on earlier bases), `testFounderCorrectionWeeklyAndPhotoBriefingJourney`, `testFounderCorrectionMidweekTrainingResponseJourney`, `testFounderCorrectionHomeConfidenceAndLoggerShoulders`, Home physical parity Dark + Mineral Light, `EvidencePhotosDEXAUITests` ×4 (Photos inspector, DEXA order/disclosures/regression inventory/chart scrub), `testDEXAAndProgressPhotosIntakeGates`. The parity journey initially failed on `Current Scan` because the eyebrow was literally uppercased; fixed with a text-case transform that keeps the accessibility label natural. |
| Generic Release compile (`generic/platform=iOS`) | **pass** on the final source (the last commit touched only a test) |
| Generator stability | `generate_project.py` run twice: byte-identical. No `project.pbxproj` change; no new files. |
| Seam scan | Release binary contains no `-physiqueos.briefing-review*`, `appearance-review`, `synthetic-photos` or fixture-file strings. All new seams are `#if DEBUG`. |

## Integration map onto Build 88

Changed files (all from `7fce3b97`):
- `SharedUI/BriefingPresentation.swift`
- `Presentation/Briefings/*` (Detail, History, Weekly, Midweek, Monthly, Photo, DEXA)
- `Contracts/BriefingReadModel.swift`: additive optional fields, so older fixtures decode unchanged.
- `Networking/ProductionBriefingMapper.swift`: additive mapping, Midweek body-composition fix, Monthly strategic fallback to `narrativeV3`.
- `Presentation/Evidence/EvidenceKitComponents.swift`: `EvidenceHorizontalScrubGesture` changed from private to internal.
- `Presentation/Root/RootTabView.swift`: DEBUG-only review routes.
- `PhysiqueOSTests/BriefingReadModelTests.swift`, `BriefingV3PresentationTests.swift`

Facts about the change set:
- No pbxproj change and no new files, so it is generator-safe.
- No Home changes. The accepted Home Latest Briefing strip and older-card behavior are untouched.
- Clean merge onto Build 88. Applying it is a fast-forward of the branch.

## Likely conflicts with Claude A (Lane A)

- A `git merge-tree` of this candidate with Lane A head `9aba5e96` reports **no conflicts**.
- The only file both lanes touch is `Presentation/Root/RootTabView.swift`. Both edits are in DEBUG review-route code in different hunks, and they auto-merge.
- Lane A edits `project.pbxproj` (its `0x1EFF` block); Lane B does not touch it.
- Re-check on integration if either lane moves.

## Next steps (Founder)

1. Review boards B1–B5. Nothing is marked accepted.
2. When authorized: integrate with Lane A, then the next build (89).
3. On device: open the five records above from Briefing History. Validate real Photo media and the paired viewer.
