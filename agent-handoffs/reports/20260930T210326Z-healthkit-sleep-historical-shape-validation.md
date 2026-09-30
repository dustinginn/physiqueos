# HealthKit Sleep historical shape validation (Phase C)

Task: healthkit-sleep-historical-shape-audit-and-evidence-handoff-20260930
Decision: inbox decision 20260930T210000Z (sleep historical shape audit and evidence handoff)

Status: complete. Result: PASSED WITH ONE CANONICAL DEFECT. The defect is Oura writing duplicate copies of a night into Apple Health; stage and awake minutes are affected, total asleep time is not. Evidence design may proceed. The defect must be fixed before stage or awake durations are shown to the Founder or used anywhere.

Nothing was deployed, uploaded, activated or written. Every production read ran inside a `READ ONLY` repeatable-read transaction with record-store mutations = 0.

## 1. Authorities (reverified live, 2026-09-30 ~21:00Z)
- **Production Server:** 08aeecdeb9f02e311efa2cd037940fbf0b249bb7.
  - Deployment 1e7d28e6 is ACTIVE; web and worker source_commit_hash both match.
  - /api/v1/health/live buildId is physiqueos-08aeecde-20260930; /ready returns 200.
  - Each probe also refused to run unless the runtime reported that exact SHA.
- **Native:** Build 73 (05912674).
- **Founder device run:**
  - Server window "Authorized (hv-2026-10-01-30d)"
  - Samples read 2878, sent 2878, not representable 0, stored 2878, no error
- **Policies:**
  - Historical validation run `hv-2026-10-01-30d` is enabled: sleep days 2026-09-01..2026-09-30, America/Los_Angeles, anchored to D0 2026-10-01.
  - Source preference is configured to `["oura"]`.
  - Prospective activation policy is ABSENT, so it is OFF. The served capability is disabled, activationFloor is null, and the operational ingest command returns 409 `HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED`.

## 2. Isolated storage verification

All checks below cover the 2878 validation records.

| Check | Result |
|---|---|
| Rows in `healthKitSleepValidationSamples` (Founder) | 2878, equal to the device's "stored" count |
| Rows for any other owner, in any Sleep collection | 0 |
| Ordinary `healthKitSleepSamples` / `healthKitSleepDays` | 0 / 0, before and after the audit, for all owners |
| Validation id prefix; id recomputes from (owner, run, externalId) | 2878 / 2878 |
| Schema `healthkit-sleep-validation-sample-v1`; runId = hv-2026-10-01-30d; owner = Founder | 2878 each |
| purpose / ingestionPurpose = historical_validation; canonicalProductionHistory = false | 2878 each |
| evidenceEligibility quarantined (strategic false) | 2878 |
| Sample end inside the authorized instant window; own sleep day inside Sep 1–30 | 2878 / 2878 |
| Distinct externalIds / content fingerprints | 2878 / 2878 |
| Exact duplicates (same source, stage, start and end) | 0 |
| Rows rewritten after create (revision or idempotency anomaly) | 0 |
| Tombstones / deleted / zero-length samples | 0 / 0 / 0 |
| Delivery | 29 batches (78–100 samples each) from 1 delivery device |
| Strategic leakage | 0 across canonicalEvidenceObjects, evidencePackages, evidenceReviews, dailyBriefings, goalConfidenceSnapshots, goalConfidenceHistory, analyses and healthKitCanonicalDays |

## 3. Sanitized source shape
- **Source families:** Oura only. All 2878 samples come from 1 Oura bundle (class third_party, written from the iPhone).
  - Apple Watch, Apple iPhone and other Apple sources: 0.
  - Sleep Cycle, WHOOP and AutoSleep: 0 (no historical Sleep Cycle presence).
  - Manual (user-entered): 0.
- **Stages present:** in_bed, awake, asleep_core, asleep_deep, asleep_rem. There are no asleep_unspecified and no unknown/future categories.
  - Roughly: core ≈38%, awake ≈29%, REM ≈19%, deep ≈14% of sample count. In-bed is exactly 1 sample per night.
- **Time zone:** every sample has timeZoneSource = `device_at_ingest` (Oura writes no HKTimeZone metadata). There is 1 distinct zone and 0 zone-shift nights.
- **Oura on each night:**
  - Technically usable: 30/30.
  - Selected primary under the Founder policy: 30/30 (ratio 1.0).
  - Fallback nights: 0; fallback reasons: none.
- **Cross-source overlap/corroboration:** 0 nights. Primary reason = `only_candidate` on 30/30. Generic ranking (no preference) picks the same primary on 30/30.

What this means: Oura-first preference is configured and would win. On this real data it was never contested, because Oura was the only Sleep writer in September. The multi-source ranking paths are covered only by synthetic tests; real data never contested them.

## 4. Canonical coverage (sleep-canon-v1, in memory only)
- **Days:**
  - Authorized 30; with representable data 30; missing 0.
  - Status: asleep_recorded 30; in_bed_only 0.
  - Canonical days produced outside the window 0; window samples not used by any in-window day 0.
- **Episodes:** 30 canonical main episodes. Secondary episodes 0, split-sleep days 0, in-bed-only episodes 0.
- **Stage detail:**
  - The main episode is staged on 30/30. Stage coverage is ≥99% on 30/30 (unspecified-only nights 0).
  - Present on 30/30 main episodes: core, deep, REM, awake and in-bed. Unspecified: 0/30.
- **Timeline:** 40–91 resolved segments per night (median ~65), so a detailed hypnogram is available.
- **In-bed:** a defensible in-bed total is reported on 30/30. The Oura in-bed interval extends beyond the asleep span on 30/30 (in-bed is a wider envelope).
- **Awake:** present inside the main episode on 30/30.
- **Technical completeness:** mainSleep, windowClosesAt and timeline are populated on 30/30. strategicEvidenceEligibility = quarantined.

## 5. Correctness

The totals checks were recomputed independently from the stored samples, not read back from the canonicalizer's own fields.

| Check | Result |
|---|---|
| core + deep + REM + unspecified = asleep | 30/30 |
| Asleep time from timeline segments = asleepSeconds (±2 s) | 30/30 |
| Awake / in-bed ever counted as asleep | 0 |
| asleep + awake ≤ episode extent | 30/30 |
| Asleep ≤ union of the primary lane's asleep samples (no gap filling) | 30/30 |
| Main-episode inputs all from the primary lane only (no cross-source mixing) | 30/30 |
| Cross-source double counting | none possible; 1 source |
| Same-lane specific stage overrides overlapping unspecified | not exercised on real data (0 unspecified); 0 violations |
| Main episode = greatest asleep | 30/30 |
| Secondary episodes technical-only | none present |
| Wake-date / 18:00 attribution recomputed from episode end + zone | 30/30 |
| windowClosesAt = the sleep day's 18:00 boundary | 30/30 |
| Main episode ends within 2h of an 18:00 boundary / starts before the prior boundary | 0 / 0 |
| All inputs in the authorized run and window | 30/30 |
| Ordinary / prospective state mutated | no (mutations 0; ordinary counts 0) |

### CANONICAL DEFECT: Oura writes duplicate copies of a night into the same source lane
- **What:** on 11 of 30 nights, Oura's own asleep and awake samples overlap each other by 60 minutes or more.
  - Greedy partitioning into non-overlapping sample chains finds 2 copies on 8 nights and 3 copies on 3 nights.
  - On 6 nights the second copy covers ≥92% of the night; the others are partial copies (34–81%).
  - There are 486 near-duplicate same-stage pairs (start and end within 5 min).
  - All copies are fully staged. Only 1 of the 11 nights involves different Oura app versions, so this is mostly not an app-update rewrite.
  - Every sample has a distinct HealthKit UUID and content fingerprint, so this is not a transport or idempotency duplicate. The source genuinely stored overlapping copies.
- **Why sleep-canon-v1 mishandles it:** v1 resolves a lane as one timeline with precedence deep > REM > core > awake > unspecified. That is correct for nested unspecified or specific sleep from one writer. For two copies of the same night, it blends them: whichever copy says "deeper" at an instant wins, and an asleep stage from one copy hides awake from the other.
- **Measured impact** (canonical vs the most complete single copy, 11 affected nights):
  - **Total asleep:** within ±2% on 11/11. Totals are reliable because of the union behaviour.
  - **Awake:** undercounted by ≤−25% on 9/11, −25..−10% on 1, −10..−2% on 1.
  - **Deep:** +2..10% on 6, +10..25% on 2, ±2% on 3.
  - **REM:** +2..10% on 6, +10..25% on 1, ±2% on 4.
  - **Core:** −10..−2% on 7, ±2% on 4.
- **Required fix (before any stage or awake duration is shown to the Founder or used anywhere):** a new algorithm version, sleep-canon-v2, with within-lane copy resolution. Pick exactly one copy per lane per episode, deterministically, and preserve the others as corroborating observations.
  - The selection rule needs a signal for "the copy Oura considers current". Candidates:
    - (a) Native forwards per-sample sync metadata if Oura writes it (HKMetadataKeySyncIdentifier / SyncVersion or an Oura external id). This needs a small Native contract addition, allow-listed and not personal.
    - (b) A Server-only rule: most complete asleep coverage, then most samples, then deterministic tie-break.
  - The next Server task should first check, read-only, which metadata Oura actually writes. That decides between (a) and (b).
  - The day schema does not change; only the algorithm version and digest change.
- **Not affected:** total asleep, day and episode attribution, main-episode selection, coverage/completeness, provenance, quarantine.

### Other canonical notes (not defects)
- **Historical time zone:** it is `device_at_ingest` for all Oura samples. A night slept in another zone would be attributed using the device's current zone. There was no travel in the window, so there is no impact here. Prospective ingest records the zone at the time of reading, which is better, but still inferred. Evidence design should allow a "time zone inferred" provenance note.
- **Multi-source paths:** Oura-vs-Watch preference, fallback, the manual tier and secondary/nap episodes are unexercised by real September data. They remain covered by synthetic tests only.

## 6. Structural comparison with Apple Health / Oura
- The stage vocabulary maps 1:1 onto the Apple Health Sleep categories Oura writes (In Bed, Awake, Core, Deep, REM). The canonical output uses no category that Health lacks. Oura's "light" sleep is written as Core.
- **One primary source per night:** Apple Health also presents one source per night once source priority applies, and here there is only one source.
- **No exact agreement is claimed.** Canonical totals were not compared with the Health app or the Oura app.
- **Smallest device spot check** (optional; it decides the v2 selection signal, and no full comparison is needed): pick one affected night (list given to the Founder in chat, not stored here). In Health → Browse → Sleep → Show All Data (filter source Oura), note whether that night shows two overlapping sets of Oura stage entries. Also note which set, if either, the Oura app shows. One yes/no per question is enough.

## 7. Privacy
This report contains no bedtimes or wake times, nightly totals, nightly stage durations, sample timestamps, HealthKit UUIDs, device names, source display names, bundle identifiers or raw records. It uses only counts, categories, coarse technical buckets and relative-difference buckets. The affected dates were kept out of GitHub.

## 8. Post-audit reverification (same read-only transaction; 4 probe runs)
- Record-store mutations: 0 on every run.
- `healthKitSleepSamples` = 0 and `healthKitSleepDays` = 0 (all owners).
- Validation samples = 2878 (unchanged).
- Prospective activation is absent/OFF; the operational ingest still returns 409.
- Strategic leakage total = 0.

## 9. Recommendation
- **Evidence design: GO.** The shape is rich and consistent: 30/30 nights, fully staged, one primary source, in-bed and awake present, detailed timeline, attribution correct. The defect is Server-internal and schema-preserving, so the design can proceed in parallel. The design handoff is published separately under agent-handoffs/inbox/prompts/ (task healthkit-sleep-evidence-design-20260930).
- **Before prospective activation or showing stage/awake minutes:**
  1. Implement sleep-canon-v2 within-lane copy resolution, as a reviewed Server candidate with synthetic duplicate-copy tests. Rerun this zero-write audit against the same stored validation samples to confirm stage and awake deltas are ≤±2% versus the selected copy.
  2. Relax the runner's D0 anchor (see §10).

## 10. Prospective D0 proposal (NOT activated)
- **The Oct 1 floor has not passed yet.** The decision assumed it had. As of this audit (Sep 30 14:01 PDT), the Oct 1 floor, Sep 30 18:00 PDT, is still ~4h away. No activation is authorized in this task, so it will pass unused.
- **Blocker for any other D0:** `activate-prospective` refuses when the historical run's anchor D0 differs (`historical_validation_anchored_to_different_d0`). This binding persists after `close-historical-validation`, so with run hv-2026-10-01-30d on record, no D0 other than 2026-10-01 can be activated.
- **Proposed runner change** (reviewed, zone must still match): allow a D0 later than the historical anchor. A later floor keeps the no-overlap invariant (validation ends at its anchor floor ≤ the new floor), and only leaves an uncovered gap.
- **Proposed D0:** the first sleep day whose floor ((D0−1) 18:00 America/Los_Angeles) is at least 24h after both fixes (canon-v2 + runner) are deployed. For example, if they deploy on 2026-10-02, D0 = 2026-10-04 (floor 2026-10-03 18:00 PDT). Sleep days from 2026-10-01 up to D0−1 would have no Sleep data.
- Prospective 2–3-night acceptance remains a separate task.

## 11. Native cleanup
Candidate a5041eb0 (branch claude/healthkit-sleep-next-native-20260930) remains queued for the next Native build. Build 74 has not been uploaded.

## Scratch tooling (not committed)
The zero-write probe bundled the reviewed `auditHealthKitSleep(historical-shape)` at 08aeecde, plus scratch aggregate checks (ingestion, correctness, overlap, copy partition). It ran via the read-only console runner (tooling 4025f175) in a READ ONLY transaction with an exact runtime-SHA guard.
