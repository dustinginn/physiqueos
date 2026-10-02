# HealthKit Sleep — prospective canary audit (Oct 2 boundary)

Generated: 2026-10-02T18:27:55Z (11:27 PDT)
Task: `healthkit-sleep-prospective-canary-audit-20261002`
Governing prompt: `agent-handoffs/inbox/prompts/20261002T180000Z-healthkit-sleep-prospective-canary-audit.md` (main `e6740054`)
Agent: Claude (read-only production audit + recommendation)
Status: **complete — canary classified FAIL (one new P2 Sleep correctness defect); strategic isolation intact**
Strategic Sleep: **OFF / quarantined (unchanged)**

## Verdict

**FAIL.** The failing gate is #11 (an unresolved Sleep correctness defect), together with a partial #7. **Strategic isolation is intact:** zero leakage across 40 collections, zero historical rewrites, zero Goal or Strategy Confidence movement.

The single prospective night (sleep day 2026-10-02) was delivered by Oura in two overlapping revisions eleven minutes apart. Oura's second write deleted 22 of the first revision's 66 samples but left 44 live. Because those 44 survivors still overlap the second revision, `sleep-canon-v2` duplicate-copy selection assembled the canonical night from both revisions: 31 samples from the stale first revision and 38 from the current one. None of the 31 has an identical twin (same stage, start and end) in the current revision. Compared with Oura's current revision on its own:

- total asleep is within 5 minutes (about 1%);
- deep is about 10 minutes lower and REM about 10 minutes lower;
- core is about 10 minutes higher and awake about 5 minutes higher;
- the stage timeline (hypnogram) is roughly half one revision and half the other.

A synthetic reproduction against the exact production canonicalizer shows the same mechanism can yield a night with **0 deep minutes** when the two copies have 120 and 180. Totals were not double-counted (a naive sum would be 780 minutes, against the canonical 450).

Even without this defect the canary would be **HOLD**, not PASS:

- only 1 of the required ≥2 natural nights exists (it is Friday 11:27 PDT on the boundary day);
- background delivery is not provable for this night, because the Founder was in the app at the same time;
- no Briefing artifact has been generated since the boundary (the first is Sunday Oct 4, 3 AM Weekly), so artifact-level leakage is clean but not yet exercised.

The Recovery shadow-calibration plan (section M) was therefore **not prepared**. No shadow input was wired.

## A. Production authority (re-verified live at 18:15–18:21Z)

- `origin/main` = `e6740054cf066f4ef3469177d66c571ad47b3eb1` (this task's prompt authority).
- App `bf57cf56-48cc-4cd6-90e4-a23ee5381741`, active deployment `faaf66bd-930f-46a2-9b8e-77e604c23a86`, `ACTIVE` 9/9.
- Web `source_commit_hash` = worker `source_commit_hash` = `4ffde0f5faf1832decfbc09d822088aeba0dca89`. Spec `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` (`physiqueos-4ffde0f5-20261002`) match on both components.
- Production branch `combined-app-platform-cutover` = `4ffde0f5`. Sleep closeout authority `5804e88d` is an ancestor of `4ffde0f5`.
- `/api/v1/health/live` `ok` and `/api/v1/health/ready` `ready`: all 9 checks green, schema `000014`.
- Shipping Native: Build 81 `6a0932517cbd8de165bf25c7637a2d2d6fea03dc`. It was read only, for the Sleep trigger path.

Access path: the approved least-privilege context `physiqueos-final-cutover-config`, with the portable runner restored byte-exact from `4025f175` (blob `f7123347`, ignored local-only). Three bounded payloads were bundled from the exact `4ffde0f5` source. Each one:

- gated on runtime SHA and owner `user_founder_001` before any database access;
- opened `REPEATABLE READ READ ONLY` and verified `transaction_read_only=on` (observed `on` each time);
- used owner-scoped SELECTs only;
- rolled back, with record-store mutation counter 0 each time.

No credential, database URL or provider spec was printed. No 401 or 403 occurred.

## B. Prospective window

- Policy (raw stored record, unchanged since 2026-10-01T06:09Z): enabled, D0 `2026-10-02`, floor `2026-10-02T01:00:00.000Z` (Oct 1 18:00 PDT), `America/Los_Angeles`, `validation_only`, open-ended, `historicalBackfill=false`, `strategicEvidenceEligibility=quarantined`, no `strategicEffectiveAt`.
- Oura source preference is configured. Served capability is enabled.
- No strategic Sleep policy record exists.
- Sleep day D = [D−1 18:00, D 18:00) local, attributed by wake date.
- Prospective acceptance counts only rows in the ordinary `healthKitSleepDays` collection with sleep day ≥ 2026-10-02.
- Sleep day **2026-10-01** is a designed gap: historical import ended Sep 30, and the floor excludes Oct 1.

## C. Prospective-night inventory (sanitized)

| Field | Sleep day 2026-10-02 |
|---|---|
| Sources observed | Oura only (third-party class). No Apple Watch or iPhone Sleep samples arrived. |
| Preferred source selected | Oura (`preferenceApplied=true`, `only_candidate`, 1 lane) |
| Canonical identity | `healthkit_sleep_day_2026-10-02` — exactly 1 row, `sleep-canon-v2`, `healthkit-sleep-day-v1`, status `asleep_recorded` |
| Asleep (main episode) | ≈ 7 h 30 min (nearest 5 min); 1 episode, 0 secondary |
| Sleep window | start and end both available; crosses local midnight (starts late evening, ends early morning, before 09:00) |
| Stages | staged, coverage 100%; deep, REM and core all present; unspecified 0; in-bed present |
| Awake / continuity | awake-in-window and longest continuous asleep stretch both available; 66 timeline segments |
| Timezone provenance | `America/Los_Angeles`, `device_at_ingest` (all 120 live samples); no zone shift; treated as reliable for prospective rows |
| Ingestion | 2 sample batches, both from 1 enrolled device and 1 session: 07:34 PDT (66 stored → r1) and 07:45 PDT (76 stored + 22 deletions → r2). Plus 1 window manifest at 07:37 PDT (66 examined, 0 retired). |
| Late updates | yes, naturally observed: same row revised r1 → r2, storage version 2 |
| Changed after first arrival | yes (r1 ≈ 6 h 50 min asleep, provisional and ending ≈ 58 min earlier; r2 ≈ 7 h 30 min) |
| Evidence | present (landing last night, night detail, trends) |
| Strategic state | `strategicEligible=false`, quarantined, `prospective_validation_only_quarantined`; ineligible even under a synthetic broad future policy |
| Anomaly | **P2:** canonical night is spliced across two Oura revisions (see defect section) |

Sample store (ordinary collection, whole collection):

- 327 rows: 120 live, 22 deleted after arrival (HealthKit deletion objects), 185 identity-only tombstones.
- All 185 tombstones are the pre-floor Oct 1 14:09Z deletions already reported by the closeout. None were created since the floor and none are eligible.
- 0 live samples end before the floor. 0 samples are strategically eligible. Every sample's purpose is `validation_only`.
- Fresh recanonicalization of the stored samples is equal to the stored day on input digest and on full content.
- Every live sample belongs to exactly one day. No live sample is orphaned.

## D. Oura source preference

- **Oura wins:** yes. It was the only lane, and `preferenceApplied=true`.
- **Apple Health and Oura overlap, and fallback when Oura is absent:** not naturally observable. No Apple Watch or iPhone Sleep samples were written on the prospective night. The canonicalizer's lane-preference tests are the only (secondary) evidence.
- **Provenance:** traceable. The 51 non-selected samples are retained as corroborating provenance, nothing was deleted by the Server, and family labels are sanitized ("Oura").
- **Unique stage information:** **materially discarded, contrary to the duplicate-copy intent.** Selection did not keep one Oura revision intact. It dropped 38 current-revision intervals (≈ 229 min of stages) and substituted 31 stale-revision intervals (≈ 227 min). See the defect section.

## E. Background delivery

What is proven:

- Prospective Sleep arrived through the app-level automatic HealthKit coordinator (batch kind `healthkit_partition`), in the same passes as Activity and Nutrition observation uploads.
- In Build 81 Native source, Sleep upload code exists only in the HealthKit coordinator, uploader and engine. Its triggers are process-launch observer registration, scene-activation bootstrap, and `HKObserverQuery` with background delivery. **No Log-tab path triggers Sleep upload.**

What is **not** proven:

- Arrival without the Founder opening the app. The 07:34 PDT Sleep upload is 4 minutes before a Founder-initiated `operating-plan.coaching-updates.save` (07:38 PDT), and a check-in followed at 08:06 PDT. The app was very likely in the foreground.
- The 07:45 revision could have been an observer wake or a foreground pass. The Server receives no trigger telemetry, so it cannot tell which.
- Overnight (23:02–07:34 PDT) there were no commands of any kind. This is consistent with Oura writing to HealthKit only when its app syncs in the morning.

Gate status: **Log-independence is supported structurally. App-closed background arrival is unobserved.**

## F. One canonical night per day

For 2026-10-02:

- exactly 1 canonical row; record id is derived from the sleep day;
- 0 historical rows on or after D0;
- no midnight split: the episode crosses local midnight and its recomputed wake-date assignment equals the stored day;
- no Oura or Watch duplicate night (Oura only); the in-lane duplicate copy did not double-count;
- Evidence lists the day exactly once.

Late-morning sleep, naps and timezone changes did not occur naturally.

## G. Late update and reconciliation

Naturally observed:

- The second Oura write updated the **same** canonical row (r1 → r2) and created no second row.
- HealthKit deletions of 22 first-revision samples were applied, and the asleep total rose from ≈ 6 h 50 min to ≈ 7 h 30 min.
- Evidence reflects r2.
- No Briefing, Confidence, analysis or other strategic record was written by it.

The reconciliation **outcome is defective** (the splice). Identity and deduplication semantics were correct.

The Native window manifest runs on a 12-hour cadence (last at 07:37 PDT, next eligible around 19:37 PDT or later). If the 44 surviving first-revision samples are no longer live on device, that manifest will retire them and the day will self-correct to Oura's current revision alone. No Sleep upload occurred after 07:45 despite many later coordinator passes, so they are most likely still live in HealthKit (Oura's known duplicate-copy behavior).

## H. Stages and continuity

- Stage coverage is 100% and the timeline has no overlaps.
- Awake-in-window, longest continuous stretch and sleep-window clocks are all present and reliable.
- Stage composition and the hypnogram are a splice (deep and REM each about 10 minutes low, core about 10 minutes high, against Oura's current revision).
- **Duration-only Recovery V1 inputs are sufficient.** The about 1% asleep deviation is far below the 30-minute material threshold.
- **Stage-level display is not trustworthy on duplicate-revision nights.** No Sleep score was created.

## I. Evidence read path (served service, read-only)

Evidence correctly reflects the stored canonical night. A display fix would not help, because the defect is upstream in canonicalization.

- **Landing:** last night = 2026-10-02 (prospective), source "Oura", stage status `available`, continuity present, not timezone-uncertain. Its main-sleep values exactly equal the stored row.
- **Night list:** 14 nights, Oct 2 prospective plus Sep 18–30 historical; Oct 1 is absent by design.
- **Seven-night average:** uses 7 nights (6 historical display-only and 1 prospective).
- **Sleep Window:** 1 night used (the prospective one); 13 historical inferred-clock nights excluded; medians present.
- **Sources:** Oura. `strategicUse=quarantined`.
- **Night detail:** stages present, 0 secondary episodes, `strategicEligible=false`.
- **2-week trends:** nightly, 13 unique days.
- **6-month trends:** weekly, 13 points; the current week has 4 nights.

## J. Strategic leakage — hard gate: zero

- **Established audit** (`auditHealthKitSleep`, 8 collections): **0**.
- **Expanded scan:** **0 hits across 40 owner collections** in every canonical table, excluding only the Sleep and configuration collections. The scan used Sleep and Recovery provenance markers: Sleep record ids, `sleep-canon-v*`, `healthkit-sleep-*`, `recovery-sleep-*`, `recoveryAssessment`, `recovery_briefing`, `recovery_status_policy`, `recovery_shadow`.
- **Records created since the floor:** 1 analysis and 1 canonical evidence object, both from the 08:06 PDT check-in. Neither has Sleep markers, and neither even contains the word "sleep".
- **Briefings (Daily, Weekly, Midweek, Monthly):** 0 created and 0 updated since the floor.
- **Goal Confidence snapshots and history, and analyses:** 0 rewritten.
- **V3 eligibility:** none. The strategic eligibility service rejects the prospective day (`prospective_validation_only_quarantined`), even under a synthetic broad policy.
- **Recovery card publication:** none.

Caveat: no post-boundary Weekly or Midweek artifact exists yet. The first artifact-level proof will be the Weekly generated Sunday Oct 4 at 3 AM PDT.

## K. Historical immutability: zero rewrite

Historical Sleep:

- 8,601 samples, all unique (ids and external ids); 87 batches; 87 unique days from Jul 6 to Sep 30.
- 87/87 `sleep-canon-v2`; 8,601/8,601 samples and 87/87 days permanently quarantined.
- 87/87 rejected under a synthetic broad policy; 0 days on or after D0.
- **87/87 stored days equal a fresh v2 recanonicalization.**
- Rows updated since the floor: historical samples 0, historical days 0, validation corpus 0. Last writes were Oct 1 05:40Z (import) and Sep 30 (2,878-row validation corpus).

Strategic artifacts:

- 0 Briefings, Goal Confidence or analysis records created before the floor were rewritten after it.
- The only pre-floor records rewritten after it are non-strategic: protocols, protocol versions, execution items and reminders (from the Founder's 07:38 Coaching Updates save), plus 2 generic HealthKit Activity days. None contain Sleep markers.

## Defect — P2 `sleep-canon-v2` cross-revision copy splice

**Mechanism** (`selectAuthoritativeLaneCopy` → `partitionNonOverlapping` in `HealthKitSleepCanonicalizer.js`):

- Candidate "copies" are built by greedy best-fit interval partitioning: each sample joins the non-overlapping partition with the latest end.
- When two genuinely different source revisions share a boundary instant, a chain can jump from one revision to the other at that instant.
- Candidates are then ranked by asleep coverage, so a spliced chain can win.

**Production evidence (2026-10-02):**

- Selected = 31 first-revision samples (0 with an identical twin in the second revision) + 38 second-revision samples.
- Not selected = 38 second-revision intervals (≈ 229 min) and 13 first-revision samples.
- Both revisions share one Oura source version, so content provenance cannot separate them.
- Fresh recompute equals the stored row, so the behavior is deterministic, not a transient write race.

**Synthetic reproduction** (scratch only, exact `4ffde0f5` canonicalizer):

- copy A = REM, deep, core, core; copy B = core, core, REM, deep; both 420 minutes, sharing boundaries.
- Canonical selection = `a4, b1, b2, b3` (spliced): deep **0**, REM 120, core 300.
- Copy A alone: deep 120. Copy B alone: deep 180.

**Why validation missed it:**

- The September v2 validation checked that the selected samples were conflict-free and that totals matched an independent resolution of *those same selected samples*. It never checked that the selection equals one real source copy.
- The existing canonicalizer tests use duplicate copies with identical segmentation, where greedy partitioning cannot splice.

**Impact:**

- Stage minutes and timeline are wrong on nights where Oura leaves a partial duplicate revision in HealthKit. September history showed duplicate copies on 11 of 30 nights. Splice incidence across history was **not measured** here.
- Asleep total is close but not guaranteed equal to the current revision; here it was 5 minutes short.
- No double counting, no data loss (all samples are preserved), no strategic effect.

**Severity:** P2. It is user-visible in the accepted Sleep Evidence stages and hypnogram, and it breaks the "Oura preferred, one copy" intent. It is display-only today, and immaterial to duration-only Recovery inputs.

**Fix direction** (not implemented; requires separate authorization):

- A versioned `sleep-canon-v3` copy partition that keeps coherent revisions intact. For example: prefer exact end-to-start continuation within a chain, or evaluate maximal abutting chains, and never let a chain switch to a sample that continues a different chain's contiguous run.
- Add the reproduction and the production shape (a partial deletion plus a differently segmented rewrite) as tests.
- Measure splice incidence zero-write on the 2,878-sample validation corpus.
- Recompute only the ordinary prospective days. Historical days stay v2 and display-only unless separately decided.

## L. Canary acceptance rubric

| # | Gate | Result |
|---|---|---|
| 1 | ≥ 2 natural prospective nights | **NOT MET** — 1 (Oct 2) |
| 2 | 3 preferred | NOT MET |
| 3 | Correct source preference | PARTIAL — Oura wins; Apple overlap and fallback unobservable; current-revision information discarded by the splice |
| 4 | One canonical night per day | PASS |
| 5 | Background arrival not Log-dependent | Log-independence PASS (structural); app-closed background arrival **UNOBSERVED** |
| 6 | Late reconciliation (if observed) | OBSERVED — identity and deduplication correct; outcome spliced |
| 7 | Stage and continuity coherent | PARTIAL — continuity and window coherent; stage composition spliced |
| 8 | Evidence read path correct | PASS (faithfully serves the stored row) |
| 9 | Zero strategic leakage | PASS (0/40 collections; no post-boundary Briefing yet) |
| 10 | Zero historical rewrite | PASS |
| 11 | No unresolved P0/P1/P2 Sleep defect | **FAIL** — new P2 copy splice |

**Classification: FAIL** (correctness defect; strategic isolation is not implicated).

## M. Recovery shadow readiness

Not prepared, and nothing was wired, because the canary did not PASS.

One note for the eventual plan: the accepted Recovery V1 baseline needs at least 14 reliable nights in the prior-28-night window. A **prospective-only** baseline therefore cannot produce a non-"Not enough data" assessment before about 14 natural nights after D0 (around Oct 15 at the earliest), however soon shadow input is authorized.

## Exact remaining gates before re-audit

1. **Founder decision D1.** Either authorize a Server-only `sleep-canon-v3` copy-coherence fix (candidate, tests, zero-write corpus incidence, deploy, prospective-only recompute, no historical rewrite), or explicitly accept the splice as P3 or display-only and defer.
2. **Natural nights.** At least 2, preferably 3, natural nights accepted under the final algorithm (Oct 3 onward). Ideally include at least one night with an Oura duplicate revision, to prove the fix.
3. **Background delivery.** One natural morning where Oura syncs to HealthKit while PhysiqueOS stays closed and unopened for at least 75 minutes (Sleep background delivery is registered hourly). The audit must then find the Sleep receipt before any Founder-initiated command.
4. **Artifact-level leakage.** The Sunday Oct 4 Weekly (and the Wednesday Oct 7 Midweek, if available) must be generated and scanned with 0 Sleep or Recovery markers, and Goal Confidence must be unmoved by Sleep.
5. **Manifest outcome.** Record whether the next window manifest (≥ 19:37 PDT Oct 2) retires the 44 surviving first-revision samples.

## Founder verification (optional, 1 minute)

Compare the Oura app's Oct 2 night with PhysiqueOS Sleep Evidence for Oct 2. If the splice analysis is right, PhysiqueOS shows about 10 minutes less deep, about 10 less REM, about 10 more core or light, about 5 more awake, and about 5 less total sleep than Oura.

## N. Tests (secondary evidence only)

- Run on exact `4ffde0f5` (exported source tree, `vitest.unit.config.js`): Sleep contract, canonicalizer, strategic eligibility and quarantine, ingest, historical import, historical validation, Evidence read service, and policy runner — **9 files, 132/132 passed**.
- Synthetic splice reproduction: confirmed (above).
- Not run: Recovery shadow-assessment tests (only relevant if PASS), the full repository suite, and any build, simulator or Native test. Free disk was 15 GiB, at the standing floor, so no disk-intensive operation was started.

## O. Mutation ledger

- Production data writes: 0 (three read-only transactions, mutation counter 0 each).
- Deploys, Native builds or uploads, policy changes, strategic-eligibility changes, Recovery wiring, backfills, imports: none.
- Local, ignored and uncommitted: the restored console runner and its `node_modules` symlink (under `.tmp/`), plus the audit payloads, raw sanitized JSON outputs and repro script in the job scratch directory. None were pushed. No raw Health samples, sample UUIDs, bundle identifiers, device identifiers or precise sample timestamps appear in this report.

## Safety flags

`READ_ONLY_VERIFIED` · `RUNTIME_4FFDE0F5` · `DEPLOYMENT_FAAF66BD` · `D0_OCT2_UNCHANGED` · `VALIDATION_ONLY` · `OURA_PREFERRED` · `ONE_PROSPECTIVE_NIGHT` · `LATE_REVISION_OBSERVED` · `P2_COPY_SPLICE` · `BACKGROUND_UNPROVEN` · `STRATEGIC_LEAK_0_OF_40` · `HISTORICAL_87_OF_87_UNCHANGED` · `NO_POST_BOUNDARY_BRIEFING_YET` · `CANARY_FAIL` · `SHADOW_NOT_PREPARED` · `NO_MUTATION`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO (sanitized aggregates only; rounded)
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
