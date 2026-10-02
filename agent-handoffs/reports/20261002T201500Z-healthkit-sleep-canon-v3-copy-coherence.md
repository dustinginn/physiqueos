# HealthKit Sleep — sleep-canon-v3 coherent Oura copy selection

- Task id: `healthkit-sleep-canon-v3-copy-coherence-20261002`
- Prompt: `agent-handoffs/inbox/prompts/20261002T193000Z-healthkit-sleep-canon-v3-copy-coherence.md` (main `59819f66`)
- Generated (UTC): 2026-10-02T20:15:00Z
- Agent: Claude
- Status: **Server v3 DEPLOYED DORMANT. The bounded Oct 2+ correction (activation) is deliberately NOT applied, because it waits for a Native build that accepts v3 (Founder decision). Production Sleep data mutation: 0.**
- Strategic Sleep: **OFF / quarantined (unchanged)**

## Founder decision taken during the task

Shipping Native Build 81 (and Build 80) shows stages only for nights whose `algorithmVersion` is exactly `"sleep-canon-v2"` (`RecoverySleepAdapter.canonicalAlgorithm`, `RecoverySleepReadModel.swift`). Any other version shows as "Being recalculated" with no stages. A truthful `sleep-canon-v3` row would therefore have hidden stages in the app on Oct 2 and on every later night.

I asked how to proceed. The Founder chose **"Dormant deploy + Native next"**:

1. Deploy the v3 Server code now. Ordinary ingestion stays on v2 until it is explicitly activated.
2. Ship a Native change that accepts v2 or v3 in the next build.
3. Then activate v3 and run the bounded Oct 2+ correction.

The app never loses stages along the way. This replaces sections J and K of the prompt for this session: the correction is prepared and dry-run, but not applied.

## Authority

| Item | Value |
|---|---|
| Production before | `4ffde0f5faf1832decfbc09d822088aeba0dca89`, deployment `faaf66bd`, reverified (ACTIVE; web/worker source SHA; branch head; ready) |
| **Production now** | **`d0ff65965233fa44e108387f01b649a2bdb476df`**, deployment **`64533990-3f04-43bc-b710-a2d28dc1850e` ACTIVE 9/9** |
| Server branch | `claude/healthkit-sleep-canon-v3-20261002` (`491daee1` → `0a794fd1` → `58b8ceaa` → **`d0ff6596`**), fast-forwarded onto `combined-app-platform-cutover` |
| **Native patch (not built)** | branch `claude/sleep-canon-v3-native-accept-20261002` @ **`3ed3eae7`**, based on Build 81 `6a093251` |
| Native shipping | Build 81 (`6a093251`), unchanged; no Native build or upload in this task |
| D0 | 2026-10-02, America/Los_Angeles, `validation_only`, strategic quarantined (unchanged) |

## Root cause (v2)

`selectAuthoritativeLaneCopy` → `partitionNonOverlapping` greedily assigns each sample to the non-overlapping partition with the latest end.

Where two genuinely different revisions share a boundary instant, both continuations are equally valid, so a chain can jump from one revision to the other. Candidates are then ranked by coverage, so a spliced chain can win.

**Topology alone cannot disambiguate this.** In the audit's synthetic case every pairing is symmetric: all four candidate chains cover 420 minutes.

## v3 algorithm (v2 unchanged, byte-identical)

v3 replaces only the within-lane copy selection.

**Identity rules**

- Each sample carries its ingestion provenance (`ingestion.batchId`, `firstReceivedAt`).
- A batch is **identity-capable** when it is known and internally single-copy.
- A batch is a **reliable revision** when it is identity-capable *and* covers at least half of the lane's night. This matches one Oura write as the Native HealthKit observer delivers it.
- Overlapping samples always belong to different copies. So two identity-capable batches whose samples overlap **conflict**, and a copy chain never contains both.

**Chain building**

- Chains are built deterministically. All samples that start at one instant are matched globally, best pair first, so input order is irrelevant.
- Continuation evidence, in order: same reliable revision; closest ingestion time (one revision's batches arrive together); exact end-to-start continuation; latest compatible end; stable order.
- Candidates are ranked like v2, then by most recently received.

**Fallbacks and reporting**

- **No reliable revision in the lane-episode** (for example historical paging batches, unknown provenance, or one batch carrying both copies): v3 returns **v2's selection exactly**. v3 changes a night only where it has evidence. Stages and in-bed both follow this rule.
- In-bed follows the selected revision.
- No overlapping duplicates: v3 equals v2 (`single_copy`).
- **Ambiguity reporting:** every continuation not decided by revision identity, while another compatible chain was eligible, is counted in `copySelection.ambiguousContinuationCount`. It is never hidden. `coherenceBasis` is one of `ingestion_revision`, `topology_v2_selection` or `single_copy`.

**Activation (explicit, bounded, not executed)**

- A new Server-owned record `healthkit_sleep_canonical_algorithm_policy` selects v3 for **ordinary** days on or after its effective day.
- When the record is absent, disabled or invalid, ingestion uses v2. That is today's state.
- The historical import port is **pinned to v2**.
- The guarded operation is `buildHealthKitPayload.mjs --kind sleep-canon-v3 --effective 2026-10-02 [--max-days N] --mode dry-run|apply`, runner `HealthKitSleepCanonV3Activation.js`. In one transaction under the owner advisory lock it:
  - writes the policy record;
  - rewrites **only** the existing ordinary days ≥ D0 (same record id, revision + 1, `sleep-canon-v3`, quarantined, provenance kept);
  - writes one audit row;
  - re-verifies in the same transaction.
- **Verification checks:**
  - stored day equals a fresh v3 recompute;
  - days before D0 unchanged;
  - ordinary samples unchanged;
  - historical days, samples and validation corpus unchanged (digests);
  - the audit row was written.
- **The operation refuses on:**
  - drift since the dry run (any sample, day, policy or historical change);
  - more days than the bound;
  - a computed day ≥ D0 that is not stored;
  - a wrong D0;
  - a missing authorization reference.
- A stored emptied (`no_sleep_recorded`) prospective day becomes an empty v3 day.

**Evidence and quarantine**

- The Server Evidence read service treats v2 and v3 as stage-capable; v1 is still not.
- The strategic quarantine allowlist gains only the new operation module.

## Tests

New permanent tests (`HealthKitSleepCanonV3.test.js`, `HealthKitSleepCanonV3Activation.test.js`) cover all 12 required cases:

1. **Exact sanitized production shape** (66-sample revision A, 22 deleted; 76-sample differently segmented revision B; two batches). v2 is asserted to splice; v3 selects exactly B, with totals and timeline equal to B alone.
2. **Audit worst case.** v2 deep = 0; v3 deep = 180 min (revision B, latest received).
3. Identical duplicates.
4. Same range, different segmentation.
5. Partial old copy + complete new copy.
6. Complete old copy + partial new copy.
7. Shared boundaries.
8. 25× shuffled input gives identical output.
9. Midnight crossing keeps one wake-date row.
10. Oura + Apple Watch overlap: preference and reason unchanged.
11. No duplicate: v3 equals v2 apart from algorithm identity.
12. Late revision keeps the same day identity.

Plus:
- the review repro (small old remainder plus a new revision split across two batches);
- a **300-night fuzz** that asserts exactly revision 2 on every night;
- historical tiny-batch shape returns v2's selection exactly;
- the same-batch ambiguity is flagged;
- the out-of-order-receipt limitation is flagged;
- one copy split over two batches rejoins;
- a mixed batch plus continuation batch rejoins;
- the zero-write coherence analysis is checked.

Activation, ingestion and isolation tests:
- **Activation:** dry run; apply; idempotency; drift refusal; bound refusal; authorization and D0 refusals; emptied day.
- **Ingestion:** dormant ingest stays v2; v3 when enabled; an invalid policy falls back to v2; the v2/v3 effective-day boundary; end to end through two real ingest batches with a deletion; historical import pinned to v2.
- **Strategic isolation:** a v3 day is quarantined and rejected by the write guard and by Sleep strategic eligibility (even under a synthetic broad policy); the quarantine structure test passes.

**Results**
- **All Sleep suites:** 11 files, 166/166 passed.
- **Full Server unit suite on exact `d0ff6596`:** 9,596 passed / 304 failed. The failing set is identical to production `4ffde0f5` (9,562 / 304), so **0 new failures**. The baseline failures are pre-existing (private Founder fixtures, evidence-review environment).
- **Native patch `3ed3eae7`:** the test `testSleepCanonV3NightsShowStagesLikeV2` was added but **NOT RUN**. Free disk stayed at 13–14 GiB, below the 15 GiB floor, while a concurrent lane was building, so no simulator could start. The next-build integrator must run it (`RecoverySleepReadModelTests`).

## Zero-write historical incidence (hard gate) — PASS

Method:
- candidate code bundled and run against production;
- one `REPEATABLE READ READ ONLY` transaction, SELECT-only guard (8 SELECTs, 0 blocked);
- write and network denial; rolled back; runtime SHA and owner gated.

| Corpus | Nights | Duplicate-copy nights | **v3 ≠ v2** | Outside duplicate nights | v3 lower where v2 coherent | Flagged ambiguous |
|---|---|---|---|---|---|---|
| Historical Evidence (8,601 samples) | 87 | 46 | **0** | 0 | 0 | 46 |
| Validation corpus, Oura preference | 30 | 11 | **0** | 0 | 0 | 11 |
| Validation corpus, generic | 30 | 11 | **0** | 0 | 0 | 11 |

- Stored historical days equal a fresh v2 recompute on **87/87**.
- **History has no revision provenance.** It was imported in about 60–77 tiny paging batches per night that mix both copies. v3 therefore keeps v2's selection there and flags every duplicate night as ambiguous.
- A topology-only analysis estimated that about 3 of the 46 historical duplicate nights are spliced under v2. They stay v2 (history is permanently v2).

The gate was not passed on the first attempts:

1. **Attempt 1** treated every batch as an identity. It fragmented copies: all 46 duplicate nights lost 25–258 minutes of sleep. **Stopped; not deployed.**
2. **Attempt 2** required a ≥50% identity and v2 fallback otherwise: 0 changes.
3. **Review P1 fix:** 0 changes.

## Oct 2 prospective proof (read-only, before deploy, candidate code on production inputs)

| Minutes | Stored v2 | Revision 1 alone (44 live) | Revision 2 alone (76) | **v3** |
|---|---|---|---|---|
| Asleep | ≈451 | ≈323 | ≈455 | **≈455** |
| Deep | ≈88 | ≈46 | ≈99 | **≈99** |
| REM | ≈112 | ≈60 | ≈118 | **≈118** |
| Core | ≈252 | ≈218 | ≈239 | **≈239** |
| Awake | ≈29 | ≈7 | ≈25 | **≈25** |
| Timeline segments | 66 | 43 | 73 | **73** |

- **v2 selection** draws from revisions 1 and 2 (the splice).
- **v3 selection** is revision 2 only: 1 generation, `ingestion_revision`, 0 ambiguity, and it **equals revision 2 alone exactly**.
- Same sleep day `2026-10-02`, same timezone and window close; stages sum to asleep; no double count (asleep is not above the union of all revisions).
- Primary source Oura, preference applied.
- Strategic: `prospective_validation_only_quarantined`, evidence state `quarantined`.
- The served Evidence projection of the v3 day would be `stageStatus available`, deep ≈ 99 min, `strategicEligible false`.

## Review

There were three independent adversarial review rounds.

- **Round 1:** no P0; the dormant deploy was confirmed safe.
  - **P1:** v3 could still splice when a small old remainder met a new revision split across two batches. Fuzz showed 65–183 splices per 2,000 nights. **Fixed.**
  - P2 Native ordering: handled by the Founder decision.
  - P3s fixed: in-bed revision, emptied day, tests.
  - P3 accepted: a theoretical double-assignment at the 18:00 boundary on D0 itself.
- **Round 2:** no P0 or P1.
  - Normal-order fuzz: **0 splices and 0 coverage loss across 7,500 nights**. Dormant v2/v1 is byte-identical over 9,000 mixed-lane nights. Shuffle-stable. Never overlapping.
  - **P2 (residual, now flagged):** an older revision's batch received *after* the newer revision's first batch can attract the newer revision's small tail. Receipt time and topology both point the wrong way, so the case is genuinely ambiguous (adversarial-timing fuzz: 2/1,500). This was silent; it is now counted in `ambiguousContinuationCount` (`d0ff6596`).
  - **This residual P2 must be accepted, or fixed further, before activation.** It is inert while dormant.
- Known limitation, by design: a revision delivered in 3 or more batches each under 50% has no reliable identity. v3 then keeps v2's selection, never worse than v2.

## Deploy (Server-only, dormant)

- **Sequence:**
  - authority reverified;
  - `d0ff6596` fast-forward pushed and the remote head verified;
  - `apps update --spec` with exactly the four stamp lines (git SHA and build ID on web and worker);
  - `create-deployment --force-rebuild` → `64533990` ACTIVE 9/9.
- **Parity checks:**
  - web and worker `source_commit_hash` = `d0ff6596…`;
  - `/health/live` and `/health/ready` buildId `physiqueos-d0ff6596-20261002`, ready, all checks green, schema `000014` (no migration);
  - fresh web and worker log envelopes `gitSha` = `d0ff6596…`.
- No policy change, no strategic eligibility change, no Native build.
- **Rollback:** push `4ffde0f5` to `combined-app-platform-cutover`, restore both stamps to `4ffde0f5…` / `physiqueos-4ffde0f5-20261002`, then `create-deployment --force-rebuild`. Safe while dormant: no v3 data exists.

## Prospective correction — dry run only (mutation ledger)

Post-deploy guarded **dry run** on live `d0ff6596` (READ ONLY, rolled back):

- **Outcome:** `dry_run`.
- **Target days:** exactly `["2026-10-02"]`. Ordinary days before D0: none. Canonical-algorithm policy: absent (dormant).
- **Planned change for Oct 2** (`sleep-canon-v2` revision 2 → `sleep-canon-v3`):

| Minutes | Stored v2 | Planned v3 |
|---|---|---|
| Asleep | 451 | 455 |
| Deep | 87.5 | 98.5 |
| REM | 112 | 117.5 |
| Core | 251.5 | 239 |
| Awake | 29 | 25 |
| Segments | 66 | 73 |

  The v3 result is one revision, with 0 ambiguity.
- **Drift facts include:** 87 historical days, 8,601 historical samples, 2,878 validation samples, 327 ordinary samples.

**Mutation ledger:**
- production Sleep writes 0;
- historical mutation 0;
- strategic mutation 0;
- policy records written 0.

Every production database interaction in this task was a read-only transaction, apart from the code deploy itself.

## Resulting canary status

- The canary stays **FAIL on gate #11 for now**. The splice is fixed in code and deployed, but the stored Oct 2 row is still the v2 splice until activation.
- It moves to **HOLD, not PASS**, once the Native acceptance build ships and the activation is applied and verified.
- Until activation, new nights keep being stored as v2. Activation re-canonicalizes all ordinary days ≥ D0 in the bounded set. If more than 7 days have passed, use `--max-days N`.

## Next steps / gates

1. **Native:** integrate `3ed3eae7` (`stageCapableAlgorithms` = v2 + v3) into the next Native build, currently being prepared by the Watch lane as Build 82. Run `RecoverySleepReadModelTests` (not run here) and ship it.
2. **Founder:** accept the flagged out-of-order-receipt residual (P2, visible through `ambiguousContinuationCount`), or ask for further work.
3. **Activation:** fresh `--mode dry-run`, then `--mode apply --authorization-ref <ref> --expected <dry-run facts JSON>`. Verify:
   - stored day equals fresh v3;
   - Evidence shows the corrected stages;
   - `strategicEligible` is false;
   - 0 strategic or historical changes.
4. **Natural gates, under v3 after activation:**
   - ≥2 (preferably 3) natural nights, ideally including an Oura duplicate-revision night;
   - one morning where Oura syncs while PhysiqueOS stays closed for ≥75 minutes (background delivery);
   - the Oct 4 Weekly (and the Oct 7 Midweek) scanned for 0 Sleep or Recovery markers, with Confidence unmoved;
   - 14 reliable prospective nights before any Recovery baseline is meaningful.
5. No historical recanonicalization, no backfill, strategic Sleep OFF.

## Disk / local-only

- Free disk stayed between 13 and 15 GiB because the concurrent Watch lane was building. No simulator or Xcode work was started below the floor; nothing was deleted in this task.
- Kept local and not pushed, all in the job scratch directory and containing no secrets:
  - read-only probe bundles and payloads;
  - sanitized aggregate JSON (`zero-write-final.json`, dry-run facts);
  - spec snapshots.
- No sample ids, timestamps, device or bundle identifiers appear in this report. Values are rounded minutes.

## Safety flags

`DORMANT_DEPLOY` · `SERVER_D0FF6596` · `DEPLOYMENT_64533990` · `V2_BYTE_IDENTICAL` · `HISTORICAL_0_OF_87_CHANGED` · `VALIDATION_0_OF_30_CHANGED` · `OCT2_V3_EQUALS_REVISION_2` · `ACTIVATION_DRY_RUN_ONLY` · `PRODUCTION_SLEEP_MUTATION_0` · `STRATEGIC_MUTATION_0` · `NATIVE_PATCH_UNBUILT_UNTESTED` · `CANARY_FAIL_UNTIL_ACTIVATION`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO (sanitized, rounded aggregates)
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
