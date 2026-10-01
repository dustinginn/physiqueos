# HealthKit Sleep Evidence: integrated Native (live contract) — Build 75 VALID

Task: healthkit-sleep-evidence-integrated-native-20261001 (prompt 20261001T140000Z)

Status: **COMPLETE.** Build 75 is uploaded and VALID. It was reconciled to the live Server b81c784e and accepted read-only against the real 87-night historical dataset. Strategic Sleep is OFF throughout.

## Exact authorities
- **Production Server:** b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8 (unchanged; no Server change was made).
- **Base:** Build 74 Native b6d98889. Build 74 = a5041eb0 Founder Production cleanup + Codex's historical-import commits, verified by diff.
- **Candidate:** branch `claude/sleep-evidence-integrated-native-20261001`, commit **77681cd7** (pushed). Commits since base:
  - 249e155f: generator drift fix
  - 723363ea: Sleep Evidence UI ported and reconciled to the live contract
  - c03aaf56: fresh-review fixes
  - 77681cd7: Build 75
- **UI source:** the approved d550c629, applied as a single commit with project and generator conflicts resolved deliberately. It was not a branch merge, and the prototype branch was not merged.
- **TestFlight:** **Build 75**, com.physiqueos.native.dev 1.0 (75), delivery **82938660-4f82-4811-ad4e-7d42cf7f0821**, processing **VALID / import VALID**.
  - Uploaded through Xcode archive plus the guarded API-key release tool; no browser login.
  - Build number reverified first: last uploaded = 74 (delivery 7583455f VALID); no branch or report claimed 75.

## Live Server contract reconciliation (Native-only adaptation)
Codex's field-level diff was applied, using the deployed `HealthKitSleepEvidenceReadService.js` as the source of truth.

- **Live decode types** in `Contracts/RecoverySleepReadModel.swift`:
  - `RecoverySleepLiveLanding`: `schemaVersion`, `lastNight`, `nights`, `sevenNightAverage{seconds,nightCount}`, `window{medianStartMinute,medianEndMinute,startSpreadMinutes,endSpreadMinutes,nightsUsed,inferredNightsExcluded}`, label-only `sources`, `strategicUse`.
  - `RecoverySleepLiveTrends`: `range{startDate,endDate}`, `granularity`, `series` (nights for night granularity, `{weekStart,averageAsleepSeconds,nightCount}` for week), `nights`, `page{limit,count,nextCursor}`, `strategicUse`.
  - `RecoverySleepLiveNight`: the flat projected night.
  - Unknown enum values decode to `unknown`.
- **Adapter:** `RecoverySleepAdapter` maps live types into the existing presentation types, so the approved screens changed minimally.
- **Server facts pass through unchanged:** totals, stage/continuity values, `stageStatus`, `timeZoneUncertain`, window medians and counts, page cursors.
- **Display-only derivations** (marked `DISPLAY-ONLY` in code; none strategic):
  - the trailing 7-day line on charts
  - the "Prior 7 nights" tile
  - the "Still updating" state (sleep day 18:00 in the night's zone)
  - the plotted-period average
- **Resources:**
  - `recovery-sleep-landing` (`throughDate` = local today)
  - `recovery-sleep-trends` (required `startDate`/`endDate`, `limit` ≤ 100, `cursor`)
  - `recovery-sleep-night?sleepDay=`
  - The separate `recovery-sleep-nights` resource is gone; Show All pages through trends.
- **Stages:** live `available`/`unavailable` map to `available` / `absent` (v2) or `pendingCorrection` (non-v2). Numbers (stages, Awake, continuity) are shown **only** when `stageStatus == available` under sleep-canon-v2. Values the Server sends for unstaged nights are withheld.
- **Origin:**
  - `historical_evidence_import` → historical
  - `validation_only` / `operational` → prospective
  - anything else → unknown (tolerated)
- **Night not found:** the live route answers a sleep day with no record with 404 `RESOURCE_NOT_FOUND`. Native shows "No sleep was recorded for this night." A missing landing route shows a calm "not available"; the Evidence Hub Recovery row stays fail-soft.
- **Ranges** (`RecoverySleepQuery`):
  - 2W/1M/3M request 14/30/90 days at night granularity with limit 100, so each fits one page.
  - 6M requests 183 days, which the Server serves weekly.
  - All is always **exactly the Evidence start (2026-07-06, the Build 74 import boundary) through today**: night granularity today (87 nights), weekly once the span reaches 183 days. If the span is 101–182 days, the UI states "Showing the latest 100 nights" rather than truncating silently.
  - No unbounded query is possible.

### Server findings (not changed; for Codex)
1. **Window medians are not midnight-safe.** `consistency()` takes medians of raw local minute-of-day (0–1439). If included nights straddle midnight (e.g. 11:50 PM and 12:20 AM starts), the median lands mid-day.
   - Native guard: a Server median is shown only if it lies within the included nights' own span and at least 3 reliable nights exist; otherwise "A typical window appears once enough nights have reliable clock times." The Server value is never recomputed.
   - Suggested Server fix: take the median in minutes-after-18:00 space.
   - Today every landing night is historical and uncertain (`nightsUsed` 0), so this does not affect current data. It will matter once prospective nights accumulate.
2. **Sleep day 2026-10-01 is in neither lane.** Historical Evidence ends 2026-09-30 and prospective D0 is 2026-10-02. That one wake date will permanently show no record unless a separate decision fills it. Today the hub row reads the latest night (Sep 30) with its date, which is correct.

## Real Founder Production read acceptance (read-only)
- **Method:** the exact b81c784e read service ran inside the production web runtime, over `REPEATABLE READ READ ONLY`. The runtime-SHA and owner gates passed, `transaction_read_only = on`, there were 0 non-SELECT statements, and the transaction was rolled back.
- It captured exactly the payloads Native requests today: landing, 2W/1M/3M/6M/All, full history paging, and four nights.
- The payloads were decoded locally through the **production decoder configuration plus the Native adapter**, in an env-gated XCTest (`testLiveFounderProductionCaptureDecodesAndAdapts`).
- The private capture lived only in the session scratch folder and was **deleted** after acceptance. Nothing private is in GitHub.

| Check | Result |
|---|---|
| Evidence Hub Recovery row | Real (Server landing present) rather than "Coming soon"; reads "Sep 30 · …" today because Oct 1 has no record (finding 2) |
| Landing | schema recovery-sleep-evidence-v1; 14 nights; last night present; 7-night average present; `strategicUse` quarantined; 1 source label |
| Sleep Window | 14/14 historical nights have uncertain zones → excluded by the Server (used 0 / excluded 14); Native shows them faded with "≈" times; no typical window claimed |
| Trends 2W / 1M / 3M | night granularity; 13 / 29 / 87 points; each fits one page; continuity available on every night |
| Trends 6M | weekly; 13 points covering 87 nights |
| Trends All | 2026-07-06 → today, night granularity, 87 points |
| Show All paging | 3 pages, 87 nights, 0 duplicates, strictly newest-first, earliest **2026-07-06** |
| Historical nights 2026-09-29 / 2026-08-15 / 2026-07-06 | schema recovery-sleep-night-v1; sleep-canon-v2; stages available; timeline 59 / 75 / 68 segments; continuity and time in bed present; origin `historical_evidence_import`; time zone `device_at_ingest`, uncertain; `strategicEligible` false |
| Prospective 2026-10-02 | Not present yet (floor 2026-10-02T01:00Z; no prospective night has occurred). Not triggered. |

**Coexistence:** the Server already selects prospective over historical for a colliding sleep day (Codex proof). Native keys rows by sleep day and the paging tests prove 0 duplicates, so prospective and historical rows cannot double-render.

## Generator drift fix (for Live Activities Phase 0)
- **Problem:** `ios/Scripts/generate_project.py` at b6d98889 omitted three hand-added Build 74 files: `Contracts/HealthKitSleepHistoricalEvidence.swift`, `Presentation/You/HealthKitSleepHistoricalEvidenceSection.swift`, `PhysiqueOSTests/HealthKitSleepHistoricalEvidenceTests.swift`. Regeneration silently dropped them.
- **Fix** (commit 249e155f):
  - The files are listed at their committed positions (app files between the N1 Sleep files and the daily-driver files; the test after `HealthKitSleepHistoricalValidationTests`).
  - Their committed object IDs are **pinned at 0x13A0–0x13A5**, with an assertion that the pin never moves the counter backwards.
  - **Proof:** regenerating at the fixed generator is **byte-identical** to b6d98889's committed `project.pbxproj` (`cmp` identical). The fresh reviewer independently reproduced this.
- **Sleep Evidence UI files:** added in dedicated late lists (`recovery_sleep_*`) allocated **after** the pinned block. The pbxproj diff is additions only (36 lines; no existing ID renumbered).
- **Live Activities Phase 0 instruction:**
  - Base on 77681cd7 (or cherry-pick 249e155f).
  - Add the Widget Extension's files and targets in new lists allocated after `recovery_sleep_*`.
  - Never insert into earlier lists, since that renumbers established IDs.
  - Verify with `python3 Scripts/generate_project.py && git diff --stat ios/PhysiqueOS.xcodeproj/project.pbxproj` (expect additions only).

## Tests / build / review
- **Fresh independent review:** no blocking issues. Five findings, all fixed in c03aaf56 with tests:
  - sleep windows starting before 18:00 could invert a bar or trap the chart domain → clamped and guarded
  - night 404 mapped to "not available" → now "night not found"
  - All could precede the Evidence start in a 101–182-day span → now always starts there, with an explicit truncation note
  - sources not confirmed as counted were labelled "not counted" → now neutral wording
  - missing "≈" on hypnogram readouts and additional-sleep times → added
- **Recovery/Sleep unit tests 23/23**, including:
  - live decode of every resource
  - data:null and night-404 handling
  - unknown-enum tolerance
  - stage available/unavailable/non-v2 gating
  - historical and validation_only origins
  - `strategicUse` quarantined
  - no-data state
  - updating window
  - secondary sleep
  - time-zone uncertainty
  - window-median guard and pre-18:00 clamp
  - range bounds for all selectors
  - Sandbox emulation equal to the Server-port payloads
  - paging with no duplicates
  - authority switch / Production never uses the fixture
  - exact live request shapes
  - the real-capture acceptance
- **Full Native unit suite:** 1660 executed, 1 skipped (env-gated live test), 1 failure: the known pre-existing `PeptideSupportEditorViewModelTests.testSandboxChangeDose…`, unrelated. The suite includes the automatic Sleep coordinator, historical import, persistent pairing and Founder-canary suites; `FounderServerAPITests` 243/243 (hub fail-soft, authority switch).
- **UI:** Recovery/Sleep acceptance 2/2 (Hub → Recovery → uncertain night → Source & Data → Trends incl. weekly → Show All → pending night; additional-sleep and unstaged nights); `testFounderProductionPageCarriesNoObsoleteDiagnostics` and `testCorrectedEvidenceJourneys` pass.
- **Release compile** succeeded. Archive, signing, dSYM and monotonic-build checks all passed in the release tool.

## Founder acceptance (Build 75)
Do **not** trigger Sleep manually. The Oct 2 prospective canary stays natural.
1. Install TestFlight **Build 75**.
2. **Evidence**: the Recovery row shows the latest night (today "Sep 30 · …"; Oct 1 has no record, see finding 2).
3. Tap **Recovery**. Check that:
   - Last Night, the 14-night chart with its dashed average, and Recent Nights render;
   - Sleep Window bars are faded with "≈" times and the note that uncertain clock times are not counted;
   - Data Sources shows Oura.
4. **See trends**: tap 2W, 1M, 3M, 6M (weekly bars), All. All should reach back to **Jul 6**.
5. **Show All**: scroll to the bottom; the oldest night is **Mon, Jul 6**, with no repeats.
6. Open one historical night (e.g. one from August):
   - timeline, stages, continuity and time in bed are present;
   - Source & Data shows "Imported from Apple Health history", "Time zone … · uncertain", "Calculation sleep-canon-v2".
7. Travel check: late-September nights show "≈" clock times and "Clock times uncertain". None should look like confidently exact local times. Total sleep is exact.

## Oct 2 canary status
- Policy enabled (validation_only, D0 2026-10-02). No prospective night exists yet (the sleep day 2026-10-02 read returned none).
- Native preserves Build 74's automatic observer path unchanged; no manual trigger was used.
- The 2–3-night empirical acceptance remains a separate, pending gate.

## Strategic status
OFF throughout: V3, Goal Confidence, Strategy Confidence, Goals, Briefings, Narrative, recommendations. There is no Recovery Briefing card, Sleep Score, targets or good/bad labels. Workout Live Activities are not bundled.

## Local-only state
- The private production capture (payloads and probe output) was deleted from the session scratch folder after acceptance.
- Scratch probe sources live in the session scratch folder, not the repository.
- The archive is retained at `~/Library/Developer/Xcode/Archives/2026-10-01/PhysiqueOS-Build75.xcarchive`.
