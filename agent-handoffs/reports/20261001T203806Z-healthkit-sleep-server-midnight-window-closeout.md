# HealthKit Sleep Server — midnight-safe Sleep Window closeout

Generated: 2026-10-01T20:38:06Z
Task: `healthkit-sleep-server-midnight-window-closeout-20261001`
Status: **complete — Server-only patch deployed and production-accepted**
Strategic Sleep: **OFF / quarantined**

## Outcome

Recovery/Sleep Evidence now computes Sleep Window medians and median absolute deviation in deterministic night-clock space anchored at 18:00 local, so reliable sleep/wake clock times that cross midnight no longer produce a daytime median. The live API contract is unchanged, the existing clock-reliability eligibility predicate is unchanged, and no Sleep canonicalization, historical record, policy, Native code, strategic reader, schema, or database row was changed.

The Server-only candidate `5804e88dac0db6bb04cf43647d6387efeab25906` is deployed in production as deployment `35f5cea0-535d-445e-8b76-1d7db5f98943`. Web and worker both run that exact SHA and exact build id `physiqueos-5804e88d-20261001`; public live/ready are green and schema migration `000014` remains the authority.

## Authority

- Repository: `dustinginn/physiqueos`.
- Candidate branch: `codex/healthkit-sleep-midnight-window-closeout-20261001`.
- Production branch: `combined-app-platform-cutover`.
- Base / prior production authority: `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`.
- Candidate and deployed code authority: `5804e88dac0db6bb04cf43647d6387efeab25906`.
- Prior deployment: `8008f928-02b6-46b0-99ab-d403b870499a`.
- Active deployment: `35f5cea0-535d-445e-8b76-1d7db5f98943`, manual force rebuild, `ACTIVE` 9/9.
- The production branch was verified at exact `b81c784e`, then fast-forwarded to exact `5804e88d`; no force push.

## Algorithm

For each already-eligible local clock minute `m`, the read service computes:

`nightMinute = (m - 1080 + 1440) % 1440`

This maps 18:00 → 0, 23:50 → 350, 00:20 → 380, 06:00 → 720 and 17:59 → 1439. Start and end values are both transformed before median and median absolute deviation are calculated. Only the medians are mapped back to the existing `0...1439` API representation:

`wallMinute = (nightMinute + 1080) % 1440`

Odd samples use the exact middle integer. Even samples retain the established `Math.round((lower + upper) / 2)` rule; MAD uses that same deterministic integer rule. The new night-clock transformation is O(n) over the already bounded eligible nights. It leaves the pre-existing median helper (which sorts at most the 14 landing nights), query count, and data dependencies unchanged; there are no new database reads.

The eligibility set remains exactly `sleepWindow && !timeZoneUncertain`. Historical `device_at_ingest` clock times remain excluded; prospective and historically reliable clocks retain the existing provenance behavior. The patch does not infer a timezone, travel, or location.

## Adversarial tests and review

The read-model file now has 22 passing tests, including all requested cases:

- starts entirely before midnight and entirely after midnight;
- tight midnight crossings and exact 23:59 / 00:01;
- wider valid distributions across midnight;
- morning wake times, noon-straddling wakes, and explicit behavior at the 18:00 branch cut;
- a sleep episode spanning midnight;
- even and odd medians, including half-integer median/MAD rounding;
- one reliable night and two reliable nights;
- mixed reliable/uncertain input and all-uncertain input;
- an outlier night;
- coherent spring-forward and fall-back IANA-zone fixtures;
- different reliable local timezone provenance without travel inference;
- historical reliable and prospective `device_at_ingest` predicate regression coverage;
- ordering independence and repeated-input determinism.

Fresh independent review found no blocking issue in the math, reliability predicate, DST/local-clock handling, determinism, API contract, or scope. It identified three low-severity test-strengthening opportunities (coherent fall-back dates, half-integer MAD, and explicit provenance variants); all three were added before the candidate commit. The production code did not change after review.

## API and Native compatibility

The landing contract remains `recovery-sleep-evidence-v1` and still returns:

```text
window {
  medianStartMinute,
  medianEndMinute,
  startSpreadMinutes,
  endSpreadMinutes,
  nightsUsed,
  inferredNightsExcluded
}
```

All names, optional/null behavior, numeric types, and surrounding landing payload are unchanged. Build 76's live decoder/adapter remains compatible because it already consumes these exact fields and performs no Server recomputation. No Native file or contract was modified.

## Test and build results

- Exact candidate Sleep Server suite: **10/10 files, 138/138 tests passed**.
- Read-model focused suite after review fixes: **22/22 passed**.
- Targeted ESLint: passed.
- `git diff --check`: passed.
- Phase 3: **308/309 passed**. The sole failure is the established local-environment absence of `private/founder/runtime-store.json`; it is unrelated to Sleep and exactly matches the previous baseline.
- Production Next build: passed. The first sandboxed attempt was blocked when Turbopack tried to bind its internal loopback port; the required outside-sandbox rerun compiled, typechecked, generated 50/50 static pages, and completed successfully with the existing file-tracing warnings.

## Production invariants

Both predeploy and postdeploy audits ran inside the exact active production web runtime under `REPEATABLE READ READ ONLY`, explicitly verified `transaction_read_only=on`, used the Founder owner guard, rolled back, and reported record-store mutations 0.

Historical Evidence remains unchanged:

- samples: **8,601 / 8,601 unique record ids / 8,601 unique external ids**;
- ingestion batches: **87**;
- canonical days: **87 / 87 unique sleep days**;
- first / last: **2026-07-06 / 2026-09-30**;
- `sleep-canon-v2`: **87/87**;
- permanently quarantined samples: **8,601/8,601**;
- permanently quarantined days: **87/87**;
- rejected by the strategic choke point even under a synthetic broad future policy: **87/87**;
- exact stored day versus fresh v2 recanonicalization: **87/87**.

All current historical clock times remain excluded from formal consistency. The historical-only landing result remains `medianStartMinute=null`, `medianEndMinute=null`, both spreads null, `nightsUsed=0`, `inferredNightsExcluded=14`. Stored canonical day objects were not rewritten.

September parity remains intact:

- validation corpus: **2,878 samples**;
- historical / validation nights: **30/30**;
- semantic parity: **30/30**;
- historical Oura-primary: **30/30**;
- duplicate-copy affected: **11**;
- selected exactly one copy: **11/11**;
- selected copy conflict-free: **11/11**;
- selected totals within tolerance: **11/11**;
- asleep total stable where required: **10/10**;
- unaffected semantically equivalent: **19/19**;
- duplicate candidate shape: **8 two-copy nights / 3 three-copy nights**.

## Policy, canary and strategic isolation

Policy is unchanged:

- D0: **2026-10-02**;
- mode: **`validation_only`**;
- source preference: **Oura**;
- `historicalBackfill=false`;
- `strategicEvidenceEligibility=quarantined`;
- no `strategicEffectiveAt`;
- strategic Sleep remains OFF.

No prospective canonical Oct 2 day has appeared naturally yet. Ordinary storage currently contains **185 deletion tombstones, 0 live samples, and 0 canonical days**. All tombstones have no ingestion purpose, 0 are strategically eligible, and there are 0 live rows before or after the activation floor. This is a pending canary, not an accepted prospective night. Nothing was triggered, replayed, backfilled, or written by this task.

Zero strategic leakage was re-proved two ways:

- established audit: 0 across canonical Evidence, packages, reviews, Briefings, Goal Confidence snapshots/history, analyses, and ordinary HealthKit canonical days;
- expanded hard-provenance scan: 0 across 25 Goal, Strategy/V3, Evidence, Briefing/Narrative/recommendation, Confidence, analysis, and canonical HealthKit collections.

Generic pre-existing uses of the word “sleep” in goals or prose were deliberately not misclassified as HealthKit Sleep leakage; the expanded scan keys on canonical HealthKit Sleep ids/schema/provenance and `sleep-canon-v*` markers.

## Read-model bounds and performance

Production acceptance exercised landing, 2W, 1M, 3M, 6M, All, five 20-night pages, and night detail. Results:

- 2W / 1M / 3M: nightly, 13 / 29 / 87 nights;
- 6M: weekly, 13 points over 87 nights;
- All: nightly, 87 nights;
- paging: 5 pages, 87 rows, 87 unique nights;
- night detail: present, `recovery-sleep-night-v1`;
- query shape: **24/24** queries owner-, collection-, and occurrence-date-scoped;
- maximum rows returned by any query: **87**;
- no query count or database-read change from the math patch.

The predeploy comprehensive audit's slowest query was 178.7 ms. Two immediate postdeploy comprehensive audits each had one transient provider/database outlier (3.8 s and 4.8 s on different pages) while all other calls stayed below 330 ms. A separate clean three-round read-only benchmark then produced:

| Round | Scoped queries | Max rows | Median call | Slowest call |
| --- | ---: | ---: | ---: | ---: |
| 1 | 24/24 | 87 | 124.4 ms | 655.3 ms |
| 2 | 24/24 | 87 | 73.2 ms | 1,133.9 ms |
| 3 | 24/24 | 87 | 85.7 ms | 328.4 ms |

The bounded query shape, row ceiling and isolated repeat are green. The outliers are recorded rather than omitted; they were not repeatable on the same page and the candidate adds no database operation.

## Diagnostic cleanup recommendation

No Sleep diagnostic, policy, validation, or audit artifact was deleted. Defer cleanup until the natural 2–3-night Oct 2–4 empirical canary is accepted. In particular preserve:

- the 2,878-sample validation corpus;
- historical import audit state and dedicated historical collections;
- prospective activation policy and its audit record;
- background-delivery/canary diagnostics needed to inspect natural delivery and late updates;
- the read-only operation tooling needed to prove strategic isolation.

After canary acceptance, separately review UI-only Founder diagnostics and obsolete one-time import controls; do not remove source-controlled auditability or the validation comparison corpus as part of this patch.

## Deployment and mutation ledger

- GitHub production branch fast-forward: `b81c784e` → `5804e88d`.
- App spec mutation: exactly four values — web/worker `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID`.
- Manual force-rebuild deployment: `35f5cea0-535d-445e-8b76-1d7db5f98943`, ACTIVE.
- Web source SHA: exact `5804e88d...`.
- Worker source SHA: exact `5804e88d...`.
- Web/worker runtime stamps: exact SHA and `physiqueos-5804e88d-20261001`.
- `/api/v1/health/live`: `ok`.
- `/api/v1/health/ready`: `ready`, all 9 checks green, schema `000014` unchanged.
- Historical/ordinary Sleep data writes: none.
- Policy writes: none.
- Strategic writes: none.
- Native changes/uploads/actions: none.
- Manual prospective trigger/backfill: none.

Private production values, raw samples, per-night durations, source identifiers, credentials, provider specs, and database URLs were not printed or committed. The local console bundles are ignored scratch artifacts and were not pushed. Two pre-existing untracked Sleep reports in this worktree remain untouched and are not part of this branch.

## Rollback authority

The patch is independently reversible and has no data/schema rollback:

1. Roll App Platform back to prior deployment `8008f928-02b6-46b0-99ab-d403b870499a` (exact source `b81c784e...`) through the guarded provider rollback path, or publish a reviewed revert of `5804e88d` on `combined-app-platform-cutover`.
2. Restore only the four web/worker SHA/build stamps to `b81c784e...` / `physiqueos-b81c784e-20261001` and force a rebuild if using the source-revert path.
3. Reverify exact web/worker parity, live/ready, policy unchanged, 8,601/87 historical invariants, September parity, and zero strategic leakage.

Do not touch historical Sleep records, the Oct 2 policy, validation corpus, Oura preference, or strategic eligibility during rollback.

## Flags

`SERVER_ONLY` · `MIDNIGHT_SAFE` · `API_CONTRACT_UNCHANGED` · `BUILD76_DECODE_COMPATIBLE` · `SLEEP_CANON_V2_UNCHANGED` · `8601_SAMPLES` · `87_DAYS` · `SEPTEMBER_30_OF_30_PARITY` · `V2_DUPLICATE_11_OF_11` · `STRATEGIC_LEAK_0` · `D0_OCT2_UNCHANGED` · `VALIDATION_ONLY` · `OURA_PREFERRED` · `CANARY_PENDING` · `BOUNDED_READS` · `WEB_WORKER_SHA_PARITY` · `LIVE_READY` · `DEPLOYED`
