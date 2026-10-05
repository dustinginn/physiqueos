# DEXA regression inventory: Build 87 vs Checkpoint D

I audited Build 87 `DEXAHistoryView` / `DEXAChartViews` / `DEXAHistoryViewModel` (`f66c7fc6`) line by line against Checkpoint D `9d2d0e06`. `DEXAHistoryView.swift` is the only presentation file D changed.

**Verdict:** nothing canonical was dropped. Every section, disclosure, route, action and data series is present, wired to the same read model and actions, and covered by a test.

## Inventory

| # | Build 87 item | In D | Route / action preserved | Data / read model preserved | Proof |
|---:|---|---|---|---|---|
| 1 | Viewing Goal scope (Goal + phase pills) | Yes | Same `selectScope(pillID:)` | `report.scope` | DEXA scope unit tests; D UI order test |
| 2 | Latest Scan: date, source label | Yes | — | `report.latestScan.date/sourceLabel` | `testDEXAOrderAndEveryIndependentDisclosure` (`dexa.latestScan`) |
| 3 | Latest Scan **View BodySpec PDF** → authenticated PDF sheet → Done | Yes (accent action in the section head) | Same `loadSourcePDF(mediaId:)` → `DEXAPDFSheet` (unchanged), Production-only guard unchanged | `latestScan.sourceMediaId` | Identifier `dexa.latestScan.viewPDF` kept. Sandbox has no PDF media, so the action correctly does not appear there |
| 4 | PDF load failure message | Yes | `sourceMediaMessage` under the scan row | — | Source audit (code path unchanged) |
| 5 | DEXA → Apple Health status card (Production) | Yes | Same coordinator state/label; **Retry** shown under the same `isEnabled && state != .reconciling` rule → `reconcilePermanent()` | `dexaHealthKitWritebackCoordinator.state` | `DEXAHealthKitWritebackTests`; identifiers `dexa.writeback` and `dexa.writeback.retry` |
| 6 | Five headline metrics (Body Fat, Fat Mass, Lean Mass, Weight, RMR) | Yes | — | `report.summary` (5) | `testCheckpointDPageInventoryKeepsEveryCanonicalSection` |
| 7 | Since Prior Scan (Body Fat pts, Fat Mass, Lean Mass; zero → muted) | Yes (locked correction) | — | `report.delta`; zero-value muting kept | Unit inventory test; D UI order test |
| 8 | Core Trends: Body Fat % + Fat Mass, Lean Mass, Total Mass, RMR, always open | Yes, 5 charts | Same tap/drag selection, now tap + horizontal-only pan | `bodyFatTrend` + `coreTrends` | Unit test (5 titles in order); UI test `testDEXARegressionInventory…` (5 charts) |
| 9 | Chart selected date / value line and first · latest · last axis | Yes | Default = latest scan; selection per series | Series points | `testDEXAChartTapScrubAndVerticalScroll` |
| 10 | "More scan history is needed…" (< 2 points) | Yes | — | — | Source audit |
| 11 | Supplemental Metrics: preview 3 → Show All 9 rows → VAT Mass + A/G Ratio charts → Close | Yes | Independent state `isSupplementalExpanded` | `supplementalDetails` (9), `supplementalTrends` (2) | UI test counts 3 → 9 rows and 2 graphs |
| 12 | Regional Tissue Lean Mass: preview 3 → 5 rows → 5 charts | Yes | Independent state | `regionalLeanTrends` (5) | UI test 3 → 5 rows, 5 graphs |
| 13 | Regional Tissue Fat Mass: preview 3 → 5 rows → 5 charts | Yes | Independent state | `regionalFatTrends` (5) | UI test 3 → 5 rows, 5 graphs |
| 14 | Scan History: preview 3 → every scoped scan → Close | Yes | Independent state; rows read-only (no scan-detail route in Build 87 either) | `report.history` | UI test 3 → more than 3 scan cards |
| 15 | Scan row: date, source, Body Fat %, fat · lean · RMR | Yes (one line) | — | `DEXAScanHistoryRow` fields | Unit history tests |
| 16 | Scan row **View BodySpec PDF** (when media exists) | Yes | Same `loadSourcePDF` | `row.sourceMediaId` | Identifier `dexa.history.<id>.viewPDF` kept |
| 17 | Loading / failure states | Yes (locked state card) | Same `viewModel.state` | — | Source audit; A state-card tests |
| 18 | Empty: "No DEXA scans in this period." (latest and history) | Yes | — | — | `testEmptyScopeProducesPendingSummaryAndNilLatestAndDelta` |
| 19 | Authority reload (`.task(id: nativeAuthority)`) clears PDF state | Yes | Identical | — | Source audit |
| 20 | Scan detail / correction route | **None in Build 87.** Correction lives in the pending DEXA Evidence Review (Checkpoint E: Correct Measurements → full replacement) | — | — | `testGenericReviewPresentationActionsAndCorrection` |

**Total graphs:** 17 (5 + 2 + 5 + 5). **Independent disclosures:** 4.

## Not dropped, re-laid out per the locked design

- **Expanded graphs.** They render as standalone chart blocks after their section's rows (locked D4/D6/D8), instead of inside the card.
- **Scan History.** It uses the D9/D10 scan cards.
- **Since Prior Scan.** It uses the final correction: one horizontal summary.
