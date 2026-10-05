# HealthKit Sleep — three-night audit PASS; prospective Sleep → V3 graduation LIVE (Sleep/V3 lane)

- Task: `healthkit-sleep-three-night-v3-graduation-20261004`
- Prompt: `agent-handoffs/inbox/prompts/20261004T231500Z-healthkit-sleep-three-night-v3-graduation-claude.md` at prompt authority `b5af822daa87c0e8f8662a40b18991b902bd0710`
- Agent: Claude (Remote Control, background job)
- Lane: **Sleep/V3 only.** This report does not supersede the Build 86 Watch/HealthKit lane. That lane's authority is unchanged: report `agent-handoffs/reports/20261004T232105Z-build86-watch-healthkit-candidate.md` (main `1fd9bfa4`), Native candidate `4f78fce6`, not uploaded.
- Status: **COMPLETE.** The audit passed, the change is implemented and tested, the Founder authorized production in chat, and it is deployed and verified.

## 1. Exact authority

| Item | Value |
|---|---|
| Production Server before | `3c0f4aef` (deployment `e9ffc644`) at audit start, 23:38Z. Another lane deployed **`51c459c4`** (deployment `07714249`) at 23:48Z during this session. This work was rebased onto it before deploy. |
| Production Server (this lane's deploy) | **`403ca5493297c2101990a7da59eed94153acc943`**, deployment **`83703fd7-c55a-4ec8-a83a-7bf18afa9e87`**: ACTIVE 9/9, web and worker `source_commit_hash` exact, both env stamps exact (`physiqueos-403ca549-20261005`). The spec-update deployment `62bcf206` was CANCELED (superseded) as designed. |
| Production Server at publication | **`27dad44a`** (deployment `99188a9e`, ACTIVE 9/9, deployed by another lane at 00:47Z), a fast-forward on top of `403ca549`: Sleep graduation included |
| Health | `/api/v1/health/live` ok; `/api/v1/health/ready` ready 9/9; schema migration `000014` |
| Source branch | `claude/sleep-v3-graduation-server-20261004`: `7de8d357` (feature) + `403ca549` (review fixes), fast-forward on top of `51c459c4` |
| HealthKit graduation policy | **version 3 → 4**. `evidenceEligibility.domains` was [activity, cardio_training, nutrition] and is now [activity, cardio_training, nutrition, **sleep**]. `startLocalDate` stays 2026-09-22, `endLocalDate` null, projection unchanged, `historicalBriefingRegeneration: false`. Audit row `healthkit_graduation_audit_4a5e70c9898e_set`, authorization ref `founder-chat-2026-10-05-sleep-v3-graduation-policy-v4`. |
| Sleep activation (unchanged) | enabled, D0 **2026-10-02**, floor 2026-10-02T01:00Z, America/Los_Angeles, mode `validation_only`, open-ended, no backfill |
| Sleep canonical algorithm (unchanged) | `sleep-canon-v3` for ordinary days ≥ 2026-10-02; historical pinned to v2 |
| Sleep source preference (unchanged) | Oura |
| V3 Confidence/Narrative | unchanged model. Sleep enters only the reserved V3 period-day Recovery slot (see §5). |
| Native | no change, no upload, no TestFlight |

**Founder authorization:** the chat answer "Authorize deploy + policy" covered (1) deploying `403ca549` through the guarded path and (2) applying graduation policy v4 adding `sleep` to `evidenceEligibility` (prospective, from D0 2026-10-02, no regeneration). The question text said "52 new tests". The exact final count is **40** (see §8); the difference does not affect anything else that was authorized.

## 2. Three-night production audit — result: PASS

**Method**
- The bounded probe was bundled from the exact live tree and identity-gated: runtime SHA, then owner, both before any database access.
- It ran under `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` with `transaction_read_only = on` observed.
- A SELECT-only query guard blocked any non-SELECT. Each run made 21–75 SELECTs with 0 record-store mutations, then an explicit ROLLBACK, then the success marker.
- It was run at 23:43Z, 23:45Z and 00:07Z (pre-deploy), then 00:22Z (post-deploy), 00:23Z (post-apply) and after the Oct 4 18:00 PDT window close (§2.3).
- Nothing raw was published: no sample ids, source names, device ids, wall-clock instants or durations.

**Completed nights.** The approved boundary is D0 2026-10-02, so the three Founder nights are sleep days **Oct 2, Oct 3 and Oct 4**, named by wake date with the 18:00-local window. There is no ordinary Sleep day for Oct 1 (pre-boundary) and none yet for Oct 5.

### 2.1 Per-night quality summary

| Check | Oct 2 | Oct 3 | Oct 4 |
|---|---|---|---|
| Canonical rows for the day | exactly 1 | exactly 1 | exactly 1 |
| Revision / algorithm | r3 / sleep-canon-v3 (the Oct 2 v2→v3 correction) | r2 / v3 (same revision the Oct 3 morning audit saw: no unexplained post-boundary revision) | r2 / v3 |
| Status | asleep_recorded, main episode, 0 secondary episodes | same | same |
| Source / provenance | Oura only (third-party lane), 1 delivery device, 2 ingestion batches, Oura preference applied | same | same |
| Multiple devices/sources | none (no Apple Watch / iPhone sleep) | none | none |
| Samples in sleep-day bucket | 142: 120 live, 22 deleted by a later Oura revision (kept as provenance) | 134: 126 live, 8 deleted | 139: 138 live, 1 deleted |
| Duplicate-copy reconciliation | 2 candidate copies → 1 coherent ingestion generation selected, 0 ambiguous continuations, same-lane corroborating samples retained, not counted | same (2 → 1, 0 ambiguous) | same (2 → 1, 0 ambiguous) |
| Selected samples resolved / live | all / all | all / all | all / all |
| Stage detail | staged, coverage 1.0 | staged, 1.0 | staged, 1.0 |
| Core + deep + REM + unspecified = asleep | exact | exact | exact |
| Asleep + awake = main window | exact | exact | exact |
| Timeline gaps / overlaps / non-positive segments | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Negative or impossible durations | none | none | none |
| Time in bed vs staged window | in-bed envelope longer than the staged window (source-reported, not inferred) | same | same |
| Zone / day boundary | America/Los_Angeles, no zone shift; episode runs from previous evening to wake morning on the correct sleep day | same | same |
| Late-arriving update | yes: 2 batches; Oura rewrite reconciled to one generation | yes: 2 batches, same | yes: a first partial delivery **before wake**, then the completed revision; reconciled to one generation |
| Stable across re-ingestion | fresh v3 recompute over the live samples equals stored content exactly; input digest matches | same | same |
| Window closed at audit | yes | yes | at 23:43Z **no** (closes 01:00Z): correctly not yet eligible. Re-verified after close (§2.3). |

Other observations:
- **185 identity-only tombstones** from `HKDeletedObject` deletions of samples the Server never received. They are consistent with Oura rewriting a night before Native delivered it. They have no occurrence date, are never counted, and are harmless.
- **Historical Sleep is untouched:** 87 days and 8,601 samples, Jul 6–Sep 30, all `sleep-canon-v2`, 0 days on or after D0. The history digest was identical across all six probes. The new seam rejects all 87 days even under a synthetic open policy.
- **Strategic leak scan:** 0 across canonical Evidence, packages, reviews, Daily Briefings, Goal Confidence snapshots and history, analyses, and generic HealthKit canonical days.

### 2.2 Quality gates

| # | Gate | Result |
|---|---|---|
| 1 | All three completed nights ingested under the approved prospective boundary | PASS: Oct 2/3/4 only, all ≥ D0, ingested after the floor, `validation_only` provenance |
| 2 | No duplicate canonical night | PASS: exactly one row per sleep day; 0 historical rows ≥ D0 |
| 3 | Provenance trustworthy and retained | PASS: one Oura lane per night, all inputs and deleted revisions retained, tombstones identity-only |
| 4 | Sleep-window/day-boundary semantics | PASS: wake-date day, LA zone, no shift, `windowClosesAt` = sleep day 18:00 PDT |
| 5 | Stage reconciliation coherent | PASS: exact stage sum, exact window arithmetic, 0 gaps/overlaps |
| 6 | Missing stage detail does not invalidate a trustworthy total | PASS by design and test (all three nights happened to be staged): an unstaged night keeps its total with stages withheld; incoherent stages are withheld, the night is kept |
| 7 | Late samples reconcile idempotently | PASS: every night had a later revision; fresh recompute = stored; replayed batches give the identical input digest (test) |
| 8 | Incomplete current night cannot become strategic early | PASS: eligibility requires the sleep-day window closed at the generator's own `asOf`. In production, Oct 4 was refused (`sleep_day_window_open`) before 01:00Z. |
| 9 | Representable without pretending 3 nights is a baseline | PASS: no personal usual until ≥ 14 prior nights; until then Recovery is reported as `insufficient` with an explicit `short_history_no_personal_baseline` uncertainty and no finding |
| 10 | No historical strategic artifact recomputed | PASS: read-time only; post-apply 52/53 owner collections byte-identical (§7) |

### 2.3 Oct 4 after its window closed (probe at 01:03Z)

- Another lane deployed Server **`27dad44a`** (deployment `99188a9e`, ACTIVE 9/9) at 00:47Z. It is a strict fast-forward on top of `403ca549`, so **the Sleep graduation is included in it**. It changed only `HealthKitWorkoutPresentationService` and its tests.
- The probe's identity gate correctly refused a `403ca549` bundle (`RUNTIME_SHA_MISMATCH`, before any database access). The probe was rebundled from the exact `27dad44a` tree.
- Oct 4: still exactly one row at **r2**. Window closed. Fresh v3 recompute still equals stored content and input digest. Stage and window arithmetic still exact. **No post-boundary revision.**
- The live overlay at production time with policy v4 now admits **Oct 2 r3, Oct 3 r2, Oct 4 r2**. All are `completed_sensor_night_in_strategic_scope`, staged, Oura, owner-scoped, with no wrapper observed-at fields.
- Since the post-apply probe, only live HealthKit workout/link collections changed: `healthKitObservations`, `healthKitCanonicalDays`, `healthKitWorkoutLinks`, link claims and one Evidence Review, all at 00:58Z. That is ordinary sync plus the other lane's Strength flow. No Sleep, Briefing, Goal Confidence, analysis or strategy collection changed.
- Historical Sleep digest still exact. Strategic leak scan 0.
- The Oct 4 Weekly (generated 14:31Z, before this change, digest unchanged) contains the word "sleep" only as a static goal-contract contextual-measure label inside its PI observations' goal context. It contains no Sleep evidence, no HealthKit Sleep marker and no Recovery theme.

## 3. Canonical Sleep semantics (unchanged by this task)

- HealthKit sample → canonical sleep day (`sleep-canon-v3`): one main episode per wake date; Oura preferred; coherent-copy selection.
- Stage totals and awake time come from a single-state-per-instant timeline.
- Time in bed is the source's in-bed union and is never used to infer efficiency.
- Ingestion purpose (`validation_only` during the D0 canary) is provenance only; it never decides strategic meaning.

## 4. Eligibility layer (new)

- Graduation policy domain **`sleep`** is evidence-eligibility only. The existing architecture-reserved name was reused; no new domain was invented. A projection scope naming `sleep` is invalid and fails closed, because Sleep keeps its own Recovery/Sleep Evidence read model.
- A night is strategic V3 evidence only when **all** of these hold:
  - the graduation `evidenceEligibility` scope names `sleep` and covers the night;
  - Sleep ingestion is enabled, and the night is on or after the **Founder-approved Sleep D0**, read from current authority. The boundary is max(scope start, D0) = **2026-10-02**. A bounded activation end also ends it. Nothing widens it.
  - it is an ordinary prospective day; historical import is permanently excluded;
  - it was computed by **sleep-canon-v3 only** (v2 carries the Oura copy-splice defect and is the fallback when v3 is off);
  - there is a main episode from a **sensor** source (manual Health entries stay display-only), with no invalid durations;
  - its **18:00 sleep-day window has closed** at the generator tick's `asOf`.
- Each eligible night becomes one read-time `sleep_night` object, one per sleep day, highest revision, never duplicated if the overlay is re-applied. It carries HealthKit Sleep lineage, so the strategic **write guard still refuses to persist it**. Stored Sleep stays quarantined.
- Sleep is **not** a briefing settlement/readiness domain: a missing night never holds a briefing.
- The cadence runner applies the overlay after the Activity/Nutrition and Cardio overlays, with one bounded sleep-day range read per tick. Failures fail closed to the given evidence and are now logged (class/code only).

## 5. Exact V3 evidence semantics

V3 sees Sleep only through the reserved period-day **Recovery** slot. Each in-window day gets `recovery = { sleepHours, sleep: { asleepSeconds, awakeSeconds, inBedSeconds, stageDetail, stages|null, revision, canonicalId } }`.

The Recovery assessor in the evidence picture applies these rules:

| Situation | Recovery assessment | Narrative |
|---|---|---|
| No night | unavailable `no_recovery_evidence_yet` (same as before) | nothing |
| < 3 window nights or < 50% window coverage | insufficient `too_few_nights` (with uncertainty fact) | nothing |
| < 14 prior nights (no personal usual) | insufficient `no_personal_baseline_yet`; facts carry `baselineEstablished: false`, `uncertainty: short_history_no_personal_baseline` | nothing |
| Personal usual established; nights within it | assessed `within_personal_usual`, neutral, **no insight** | nothing (narrative byte-identical, including the `sparse` wording) |
| Consistent shortfall: ≥ 2/3 of ≥ 3 window nights ≥ 45 min below the person's own prior-night median | assessed `below_personal_usual`; one `sleep_below_usual` insight: execution-scoped, concern, modest strength (≤ 1.8 × domain weight 0.6), `requiresCompleteWindow`, `supportingContext` | may be told |

When it is told:
- **Recap or coaching clause:** "Sleep ran shorter than your recent usual on N of M recorded nights". While the usual rests on fewer than 28 nights it adds ", against a usual that is still only a few weeks old".
- **Takeaway:** "the shorter nights are worth keeping an eye on, but they are not a reason on their own to change the plan".

Guardrails, enforced by code and tests:
- Never a headline phrase.
- Never an action or step.
- Never promoted into a lead slot ahead of goal evidence.
- Never concluded in a partial window: Midweek never says it.
- No generic sleep target, no diagnosis, no causal language.
- The Weekly 0.9 floor needs roughly 5 of 7 nights short.
- **Goal Confidence, Strategy, recommendation, Energy, Training and PI selection never read it:** Confidence projection and interpretation use the raw store, and `sleep_night` matches no other reader's type filter.
- The wrapper deliberately has no `firstObservedAt`/`lastObservedAt`. The legacy Weekly `references` list is type-blind; a test caught this and it was fixed. Legacy Weekly and Midweek artifacts are byte-identical with Sleep present.
- Dependency-manifest fingerprints are unchanged, so no historical briefing becomes stale or regenerates.

## 6. Tests

- New tests:
  - `HealthKitSleepGraduation.test.js` (12)
  - `BriefingRecoverySleepV3.test.js` (19; includes a sweep over every synthetic Weekly scenario × 4 seeds through the real Weekly V3 finalizer: same Confidence, recommendation and holistic realization, clean voice, Sleep never in the headline)
  - `WeeklySleepNightInvariance.test.js` (2; real Weekly and Midweek services byte-identical)
  - composition (5)
  - graduation-policy runner (1)
- Updated reviewed tripwires: Sleep quarantine allowlist, strategic read boundary, seam semantics.
- Prompt Part F coverage:
  - completed Sleep enters;
  - incomplete/current and pre-start do not;
  - duplicates and replays do not double;
  - missing or incoherent stages handled;
  - short history carries uncertainty;
  - no mechanical Goal-confidence change;
  - Narrative mentions Sleep when relevant and not when irrelevant;
  - historical artifacts untouched (manifest fingerprint, read-only overlay, runner invariants);
  - Cardio/Activity/Nutrition/Energy unchanged.
- Full unit suite at `403ca549`: **10,039 tests: 9,732 passed, 302 failed, 5 skipped.** The 302 failures are **exactly** the same set that fails on the untouched base `51c459c4` (pre-existing, unrelated). **+40 new tests, 0 new failures.** Two load-induced 5 s timeouts (machine load ~300) passed on rerun.
- Lint is clean on the change. Two pre-existing `no-assign-module-variable` errors in untouched lines of `BriefingSectionContracts.js` remain.
- **Independent fresh-context review: no blocker.** Applied fixes: v3-only, activation end bound, no lead-slot promotion, `sparse` invariance, failure logging, dropped the training fact, and the dry-run wording. Remaining review notes are in §10.

## 7. Production rollout and proof of historical immutability

1. **Guarded deploy.** The deploy branch was verified at `51c459c4`, then a fast-forward-only push, a 4-line stamp diff on web and worker, `apps update`, and `create-deployment --force-rebuild`. Then: ACTIVE 9/9, exact `source_commit_hash`, exact stamps, `/live` + `/ready` green.
2. **Post-deploy read-only probe at the new SHA:** 0 of 53 owner collections changed versus the pre-deploy baseline. The new code was inert while the policy did not name `sleep` (simulation: 0 nights).
3. **Graduation dry run** (`--no-values`):
   - Only `evidenceEligibility` gains `sleep`; projection is unchanged.
   - Activity/Nutrition days graduated: 0. Cardio unchanged. `historicalBriefingRegeneration: false`.
   - Predicted mutations: policy record + 1 audit row.
   - Sleep simulation at 00:22Z: **Oct 2 r3 and Oct 3 r2 eligible; Oct 4 refused `sleep_day_window_open`**. No historical collection read.
4. **Apply**, fenced by the dry-run facts: `applied`, **policyVersion 4**, all 14 in-transaction invariants true:
   - policy exactly as authorized, no historical briefing regeneration, audit row present;
   - canonicalization, Workout and Sleep-activation policies untouched;
   - observations, canonical days, workouts, links, claims, Evidence, Sleep days and Sleep samples unchanged.
5. **Independent post-apply probe:** **52/53 owner collections byte-identical** to the pre-deploy baseline. The only change is `healthKitConfiguration` (32 → 33 rows: policy v4 + audit row). Byte-identical collections include:
   - `dailyBriefings`, `goalConfidenceHistory`, `goalConfidenceSnapshots`, `analyses`;
   - `canonicalEvidenceObjects`, `evidencePackages`, `evidenceReviews`, `goals`, `phaseStrategies`;
   - all Sleep collections and historical Sleep.

   Strategic leak scan 0. Briefings since D0 (incl. the Oct 4 Weekly `weekly_briefing_2026-09-27_2026-10-03`) contain no Sleep wording.
6. **After the Oct 4 18:00 PDT close** (§2.3): Oct 4 became eligible at its stable r2; fresh recompute still equals stored. Production is now `27dad44a` (another lane, fast-forward on top of this work), which still carries the Sleep graduation.

No briefing was generated to prove the feature, and none was regenerated.

## 8. What the next naturally generated V3 briefings will do

- **Midweek, Wed Oct 7 03:00 PDT** (Sun–Tue Oct 4–6):
  - Completed Oct 4–6 nights reach its period evidence; Oct 2–3 sit in its baseline span.
  - Recovery: `no_personal_baseline_yet` (2 prior nights), and Midweek is a partial window anyway.
  - **No Sleep wording, no Confidence effect.** Recovery appears only in the synthesis lineage (`considered`).
- **Weekly, Sun Oct 11** (Oct 4–10): 7 nights in window, 2 prior → `no_personal_baseline_yet`, silent.
- **Weekly, Sun Oct 18:** 9 prior nights → still silent.
- **Weekly, Sun Oct 25** (Oct 18–24): ≥ 16 prior nights (if every night arrives), so the personal usual exists. Sleep can first be told, and only for a consistent shortfall, carrying the "few weeks old" caveat.
- **Monthly, Sun Nov 1** (October): its baseline predates D0 (0 prior nights), so it stays silent.
- DEXA/Photo event briefings are not cadence-runner generated: no Sleep (matches "No DEXA/Photo Recovery V1").

## 9. Remaining physical / Founder acceptance

- **Closed-app background delivery** is still unproven: no morning yet shows Oura syncing with PhysiqueOS unopened for ≥ 75 min. It is not a strategic-correctness gate (a missing or late night is simply absent or insufficient) but remains a canary item.
- Natural acceptance: after Wed Oct 7, confirm the Midweek has no Sleep wording and Recovery in its lineage is `no_personal_baseline_yet`. After ~Oct 25, review the first Weekly that may tell Sleep.
- The **Recovery Briefing V1** card (graph-driven Sleep treatment, Green/Yellow/Red) remains a separate, unbuilt design/implementation item. This task only made graduated Sleep available as V3 narrative evidence.

## 10. Risks, rollback and open notes

- **Rollback ORDER (important):**
  1. First remove `sleep` from `evidenceEligibility` through the guarded graduation-policy operation. Sleep use stops on the next tick; nothing is deleted.
  2. Only then roll code back if needed.

  Any pre-`403ca549` build treats a policy record naming `sleep` as invalid and would switch off **all** HealthKit graduation (Activity, Nutrition, Cardio).
- The Sleep boundary is derived (scope start, Sleep D0 and Sleep end) rather than pinned in the graduation record. A future Sleep activation re-run could move it later or earlier, though days before any D0 are historical and permanently excluded. Consider pinning a per-domain start in a later policy revision.
- Window closed is not the same as data complete. A night that syncs after its 18:00 close graduates on its later revision. A night whose samples arrive only partially before the next 03:00 briefing would read short. The consistent-shortfall rule bounds the impact.
- The Recovery/Sleep Evidence read model still returns `strategicUse: "quarantined"` / `strategicEligible: false` (stored-record quarantine). Native decodes but does not display it; reconciling the wording is a future contract revision (ledger entry proposed).
- The ingestion mode stays `validation_only` (provenance label only). An optional relabel to `operational` has no strategic effect.
- Concurrency: another lane deployed `51c459c4` mid-session. This deploy is a strict fast-forward on top of it and preserves that change.

## Backlog / ledger

The backlog item 4/5 updates and a ledger entry (Recovery/Sleep read-model `strategicUse` after graduation) are on branch `claude/sleep-v3-backlog-ledger-20261005`, commit `11af55ed`, docs only. Per agent git rules they were **not** pushed to `main` directly. To open the PR: https://github.com/dustinginn/physiqueos/pull/new/claude/sleep-v3-backlog-ledger-20261005. Merge when convenient.

## Flags

`GH_AUTHORITY_VERIFIED` · `THREE_NIGHT_AUDIT_PASS` · `GATES_10_OF_10` · `READ_ONLY_ROLLBACK_VERIFIED` · `HISTORICAL_SLEEP_DIGEST_EXACT` · `STRATEGIC_LEAK_0` · `SERVER_403CA549_DEPLOYED` · `GRADUATION_POLICY_V4` · `52_OF_53_COLLECTIONS_IDENTICAL` · `OCT4_ELIGIBLE_AFTER_CLOSE` · `NO_BRIEFING_REGENERATION` · `CONFIDENCE_UNCOUPLED` · `NO_NATIVE_CHANGE` · `NO_TESTFLIGHT`

- CONTAINS_SECRETS: NO
- CONTAINS_CREDENTIALS: NO
- CONTAINS_PRODUCTION_EXPORTS: NO
- CONTAINS_FOUNDER_EVIDENCE: NO (quality/structure facts only; no sleep durations, instants or identifiers)
- SAFE_FOR_CHATGPT_RETRIEVAL: YES
