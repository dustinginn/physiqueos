# HealthKit Sleep — sleep-canon-v3 prospective activation (final)

- Task id: `build82-sleep-v3-native-integration-activation-20261002` (activation phase)
- Authority:
  - the Founder confirmed that Build 82 (`e2cbcd0c`, TestFlight delivery `f3d09d99`) is installed remotely, with Sleep Evidence showing stages;
  - prompts `20261002T210000Z-build82-sleep-v3-native-integration-activation.md` and `20261002T212500Z-build82-testflight-remote-workflow-correction.md`.
- Generated (UTC): 2026-10-02T22:00:00Z
- Status: **complete. sleep-canon-v3 ACTIVE for ordinary prospective Sleep (effective 2026-10-02). The Oct 2 night was corrected. Historical mutation 0, strategic mutation 0. Canary FAIL → HOLD (not PASS).**
- No Native build, no upload, no Server deploy.

## Preflight (fresh, read-only)
- **Production:** `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990` ACTIVE, web and worker source SHA verified; `/health/live` ok, `/health/ready` ready, buildId `physiqueos-d0ff6596-20261002`.
- **Sleep policy:** enabled, D0 `2026-10-02`, `validation_only`, `strategicEvidenceEligibility = quarantined`, `historicalBackfill = false`. Source preference configured (Oura).
- **v3 dormant:** canonical-algorithm policy not enabled, so ingestion was v2. No strategic Sleep policy record exists.
- **Read-only state probe** (52 SELECTs, 0 blocked, rolled back):
  - ordinary Sleep: 327 samples, **1 day** (`2026-10-02`, `sleep-canon-v2` revision 2, not equal to fresh v3);
  - historical: 87 days and 8,601 samples; validation corpus 2,878 samples;
  - Sleep/Recovery strategic markers: **0** across all non-Sleep collections;
  - digests captured for all 52 owner collections.

## Dry run (fresh, guarded, `--max-days 1`)
- Outcome `dry_run`.
- **Target days:** exactly `["2026-10-02"]`, the only ordinary day stored. No new natural night had arrived. No ordinary days before D0.
- **Planned change:** `sleep-canon-v2` revision 2 → `sleep-canon-v3`. Coherence basis `ingestion_revision`, one generation (the latest Oura revision), 0 ambiguity.
- **Expected facts captured**, including the historical day, historical sample and validation digests.

## Apply
- Guarded operation `sleep-canon-v3` apply on live `d0ff6596`, one READ COMMITTED transaction under the owner advisory lock.
- Authorization `founder-confirmed-build82-remote-install-2026-10-02; …`, the exact dry-run facts, `--max-days 1`.
- **Outcome `applied`. Committed.**

**Mutation ledger** (complete):
1. Created `healthKitConfiguration/healthkit_sleep_canonical_algorithm_policy`: enabled, `sleep-canon-v3`, effective `2026-10-02`, scope `ordinary_prospective_only`, historical algorithm `sleep-canon-v2`.
2. Created one audit row `healthkit_sleep_canon_v3_audit_5514cc75…`.
3. Rewrote `healthKitSleepDays/healthkit_sleep_day_2026-10-02`, revision 2 → 3. Same record id; provenance and `validation_only` kept; quarantined; `strategicEligible = false`.

**In-transaction verification** (all true): policy enabled for v3; stored equals fresh v3; still quarantined; ordinary day count unchanged; days before D0 unchanged; ordinary samples unchanged; historical days, samples and validation corpus unchanged; audit written.

## Independent post-apply verification (read-only probe, diffed against preflight)
- **Collections changed: exactly 2 of 52.**
  - `healthKitConfiguration`: 26 → 28 (policy and audit).
  - `healthKitSleepDays`: Oct 2 content.
- **The other 50 collections are digest-identical**, including:
  - historical Sleep days **87/87** and samples **8,601/8,601**;
  - validation corpus **2,878**;
  - ordinary samples 327;
  - `dailyBriefings` 56, `goalConfidenceSnapshots` 2, `goalConfidenceHistory` 31, `analyses` 416;
  - `canonicalEvidenceObjects` 582, `protocols` 24, `protocolVersions` 29;
  - every other strategic, goal, plan and evidence collection.
- **Historical mutation = 0. Strategic mutation = 0.** No Briefing, Goal Confidence, Strategy Confidence, Narrative, recommendation or Recovery change.
- Sleep/Recovery strategic markers: still **0**.
- No strategic Sleep policy exists. Activation D0, mode and quarantine are unchanged.

**Affected prospective day: `2026-10-02`**

| | Before (v2, revision 2) | **After (v3, revision 3)** |
|---|---|---|
| Asleep (min) | 451 | **455** |
| Deep | 87.5 | **98.5** |
| REM | 112 | **117.5** |
| Core | 251.5 | **239** |
| Awake | 29 | **25** |
| Timeline segments | 66 | **73** |
| Selected samples | 69 (two revisions spliced) | 76 (one coherent revision) |

- Stored equals a **fresh v3 recompute** (input digest).
- **Coherent-copy diagnostics are present:** `coherenceBasis = ingestion_revision`, `selectedGenerationCount = 1`, `ambiguousContinuationCount = 0`, 2 candidates, 44 corroborating samples.
- **Evidence:** `stageStatus available`, algorithm `sleep-canon-v3`, stages and continuity present, 73 timeline segments, `strategicEligible = false`. Native Build 82 accepts v3 as stage-capable; the Founder confirmed Sleep Evidence on Build 82.
- **Strategic:** Sleep eligibility `prospective_validation_only_quarantined`; the write guard state is `quarantined`.
- The result matches the expected corrected values exactly (rounded minutes).

**Ingestion going forward:** ordinary Sleep days ≥ 2026-10-02 are now computed with sleep-canon-v3. Historical import stays pinned to v2.

## Canary status: FAIL → **HOLD** (not PASS)
The P2 copy-splice defect is resolved for prospective Sleep. The remaining natural gates are below.

## Remaining natural gates
1. At least **2, preferably 3, natural prospective nights** (Oct 3 onward) accepted under sleep-canon-v3. Ideally one is an Oura duplicate-revision night, to prove v3 naturally; check its `copySelection` diagnostics.
2. **Closed-app background delivery:** one morning where Oura syncs to HealthKit while PhysiqueOS stays unopened for ≥ 75 minutes, with the Sleep receipt preceding any Founder command.
3. **Post-boundary strategic-leakage checks:** the Sunday Oct 4 Weekly (and the Wednesday Oct 7 Midweek if needed) scanned for 0 Sleep/Recovery markers, with Goal and Strategy Confidence unmoved by Sleep.
4. **14 reliable prospective nights** before any Recovery baseline interpretation is meaningful (around Oct 15 at the earliest).
5. Strategic Sleep stays **OFF/quarantined**. There is no Recovery wiring and no historical recanonicalization.

**Founder check (optional):** open Sleep Evidence. Oct 2 should show Deep, REM, Core and Awake normally, never "Being recalculated". The values are now about 98, 118, 239 and 25 minutes, with total sleep about 7 h 35 min. Watch Build 82 behavior is unchanged.

## Rollback (if ever needed)
Disable the canonical-algorithm policy (status `disabled`); ingestion falls back to v2 for new recomputes. The Oct 2 row would stay v3 until re-ingested. Historical data never changed.

## Safety flags
`V3_ACTIVE_PROSPECTIVE` · `OCT2_CORRECTED_REV3` · `COLLECTIONS_CHANGED_2_OF_52` · `HISTORICAL_MUTATION_0` · `STRATEGIC_MUTATION_0` · `MARKERS_0` · `CANARY_HOLD` · `NO_NATIVE_BUILD` · `NO_UPLOAD`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO (rounded aggregates)
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
