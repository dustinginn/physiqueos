# HealthKit Cardio — historical deferred-walk reconciliation (Gates 7/8/9), strictly serial, all four applied and verified

Generated: 2026-09-25 (UTC ~16:20)
Task id: `claude-healthkit-cardio-historical-reconciliation-serial-20260925`
Agent: Claude (HealthKit lane). Governing prompt: `agent-handoffs/inbox/prompts/20260925T111500Z-claude-healthkit-cardio-historical-reconciliation-serial.md`.

## Result: ALL FOUR LEGACY DEFERRED WALKS RECONCILED SERIALLY; EVERY PER-ENTRY VERIFICATION AND THE FINAL INVARIANT AUDIT PASSED.

**Four canonical Cardio `walking` workouts were created (one per authorized observation), whole-day Activity totals are unchanged, and nothing else changed except the reviewed runner's own artifacts.** No observation outside the authorized four was touched. No policy change, no strategic-eligibility change, no backfill, no auto-confirm, no Server deployment, no Native upload/device operation, no historical briefing regeneration, no Indoor/Outdoor inference. No raw observation identity appears below (stable sha256-prefix hashes only; raw ids are held only in owner-only local files).

Authorization: the Founder's explicit authorization in the governing prompt, plus a plain-words chat confirmation for the four serial production writes (the session's auto-mode classifier cannot see GitHub prompts). Per-entry authorization references: `founder-chat-2026-09-25-cardio-historical-reconcile-entry-N-of-4-<id hash>`.

## Authority and authorized set (reverified before EVERY mutation, inside each entry)
Server `e88b8ef78fa236ce09660997f4084bde069018a7`, deployment `9727de79-588e-4445-9306-53b0ee26971e` ACTIVE, web+worker `source_commit_hash` exact, nothing pending, `/ready` healthy with `PROVIDER_MIGRATION_000014_APPLIED`; workout policy exactly **version 4, `["cardio","strength"]`**, enabled, open-ended, `effectiveLocalDate 2026-09-23`, quarantined, `historicalBackfill false`, `linkAutoConfirm false`, runner digest `4e1c59ab2f09bf886cd69207eb22fed3`. The deferred set before entry 1 was exactly the four inventoried identities (before entry N it was exactly the remaining `5-N` of them) — all `workout_canonicalization_deferred / family_not_in_activation_scope`, classifier `cardio/walking`, Apple type `52`, no stored `isIndoorWorkout` key, no canonical workout.

## Deterministic serial order (localDate, then start time) and per-entry outcome
Each entry ran the identical protocol in its own invocation: fresh authority read -> fresh full state read (+ standard audit) -> **fresh dry run for exactly that observation** -> assertions -> **apply bound to THAT dry run's facts** (never an earlier entry's) -> immediate independent read-only verification -> idempotency replay -> only then the next entry. Dry runs were never precomputed for later entries.
| # | Id hash | Local date (zone) | Dry run | Apply (UTC) | Verify | Audit row | New canonical workout |
|---|---|---|---|---|---|---|---|
| 1 | `c9d69996b1` | 2026-09-23 (America/Los_Angeles) 13:29:52Z | `dry_run` | `applied` 16:04:55–16:05:25 | PASS | `healthkit_deferred_workout_reconciliation_audit_707944a1418c` | `72b253ae32` |
| 2 | `25fff29121` | 2026-09-23 (America/Los_Angeles) 14:57:14Z | `dry_run` | `applied` 16:07:21–16:07:50 | PASS | `…_229fdf88bc81` | `73911e3c8f` |
| 3 | `3c5ef90420` | 2026-09-24 (America/Chicago) 16:04:20Z | `dry_run` | `applied` 16:09:45–16:10:14 | PASS | `…_e71d176ed0bc` | `d72350fc8d` |
| 4 | `99d4773c09` | 2026-09-24 (America/Chicago) 16:50:11Z | `dry_run` | `applied` 16:12:12–16:12:41 | PASS | `…_302333d5dc32` | `70e5b3cfc0` |
Every dry run predicted EXACTLY four mutations — create canonical workout, its `update_coexistence`, the observation's `update_reconciliation`, one audit row — with `unchangedByDesign`: auto-confirm off, no link, no claim, no Training Logger session, strategic eligibility quarantined; facts bound to policy version 4 / digest `4e1c59ab…`. No entry returned drifted/refused; no retry was needed. (A separate zero-write dry run of entry 1, and a `dry` test mode of the orchestrator, were used only to learn the output shape and test the pipeline; neither fed an apply.)

## Resulting canonical workouts (all `family cardio`, `canonicalType walking` — generic, revision 1, quarantined, no link, not strategic)
| Hash | Local date | Source obs | Duration | Active kcal | Avg HR | Distance | Zone |
|---|---|---|---|---|---|---|---|
| `72b253ae32` | 2026-09-23 | `c9d69996b1` | 1079.5 s | 78.65 | 90.85 | 1516.0 m | LA |
| `73911e3c8f` | 2026-09-23 | `25fff29121` | 943.7 s | 107.14 | 111.33 | 1548.0 m | LA |
| `d72350fc8d` | 2026-09-24 | `3c5ef90420` | 1067.0 s | 157.58 | 121.07 | 1624.6 m | Chicago |
| `70e5b3cfc0` | 2026-09-24 | `99d4773c09` | 987.9 s | 188.13 | 142.68 | 1626.6 m | Chicago |
Telemetry equals the stored observation payload exactly (verified per entry); each canonical workout's source identity is its own observation only; each observation moved to `workout_canonicalized` pointing at exactly its new canonical record. **Indoor/Outdoor was NOT inferred, fabricated or written**: none stores `isIndoorWorkout`, so all four are generic `walking`. (The Founder's recollection that Sep 23 were outdoor and Sep 24 indoor is not source metadata and was deliberately not used.)

## Activity accounting — whole-day totals invariant, decomposition as designed
Canonical whole-day Activity records (baseline before entry 1 vs final): **byte-identical, including revision** — 2026-09-21 934.82 kcal / 101 min; 2026-09-22 847.454 / 107; **2026-09-23 782.698 kcal / 107 min (rev 51, `complete_day`)**; **2026-09-24 914.709 kcal / 65 min (rev 18, `complete_day`)**; 2026-09-25 79.707 / 0 (`partial_day`, rev 9, also unchanged). Per-entry checks also proved the totals unchanged after each apply.
Workout / non-workout decomposition (independent recomputation from the canonical records with the documented arithmetic — `composeDailyActiveEnergyWithWorkouts`/`composeWholeDayWorkoutEnergy`: workout energy is descriptive, never additive; each canonical identity counts once; Strength counts only via a confirmed link; Cardio needs no Logger confirmation; `non_workout = max(total - workout, 0)`):
- **Sep 23:** whole-day 782.698 -> 782.698 | workout **320.523 -> 506.308** (Strength 320.523 confirmed + Cardio 78.65 + 107.14) | non-workout **462.175 -> 276.390** (sum reconciles to the total).
- **Sep 24:** whole-day 914.709 -> 914.709 | workout **unknown/none -> 345.718** (Cardio 157.58 + 188.13; the Sep 24 Strength workout (206.21 kcal) is still only an unconfirmed candidate, so by the existing semantics it does NOT count and stays inside non-workout) | non-workout **-> 568.991** (never negative).
- Sep 22 (untouched control): 847.454 / workout 542.965 / non-workout 304.489 — identical.
Each canonical identity appears once (9 unique canonical workouts; each source observation used once); `workoutEnergyAdded` remains 0. Note: this decomposition is my recomputation from stored canonical records, not the rendered app payload — the on-device Activity Detail is the acceptance check.

## No Logger / link / claim / strategic proof (final state vs pre-reconciliation baseline)
- Strength canonical workouts (3) and all 5 pre-existing canonical workouts: byte-identical; **links 2 and claims 4: count and content digest IDENTICAL**; link status `confirmed 2`; one-to-one integrity all zeros; `ambiguousAutoLinked 0`; Logger Strength sessions in window 3 (unchanged). **No Cardio workout has any link, claim or Logger session.** `healthKitWorkoutsStrategicEligible 0`, `NotQuarantined 0`, `derivedRecordsInStrategicEvidence 0`.
- Strategic digests (35 collections): **32 identical** (Goal, Confidence, briefing, plan, protocol, evidence, and 6 other training collections); the 3 that changed are exactly the reconciliation-owned HealthKit training collections — `healthKitCanonicalWorkouts` 5 -> 9, `healthKitConfiguration` 15 -> 19 (the four audit rows), `healthKitObservations` 270 -> 270 rows (the four observations' reconciliation state updated in place). No historical briefing was regenerated.
- Policy record identical to pre-reconciliation (v4, `["cardio","strength"]`, quarantined, no backfill, no auto-confirm); Activity/Nutrition daily policy and graduation policy identical; the existing configuration records (policy + prior audits) unchanged.

## Idempotency
After each apply, a dry-run replay of the exact same request (same authorization reference) returned **`already_reconciled` with no predicted mutations** — a no-op, never a second canonical workout. No second mutating apply was performed.

## Health / migration / logs
Deployment `9727de79` ACTIVE and unchanged, web+worker `e88b8ef7`; `/live` 200, `/ready` healthy on repeated samples with `PROVIDER_MIGRATION_000014_APPLIED`; migrations 14 (last `000014_evidence_intake_text_provenance`) unchanged; web+worker logs since the policy apply: **0 error-level lines, 0 `settlement_gate_error`, 0 old-SHA lines**, no warn/error events.

## Founder real-device acceptance recommended now (Build 60)
1. **Activity Detail 2026-09-23** shows two historical Cardio workout rows (generic Walking/Cardio label is EXPECTED); 2. **Activity Detail 2026-09-24** shows two historical Cardio workout rows (generic is EXPECTED); 3. whole-day Activity totals unchanged (Sep 23 ≈ 783 kcal, Sep 24 ≈ 915 kcal); 4. workout vs non-workout calorie split looks sensible with no double counting (Sep 23 workout ≈ 506 kcal; Sep 24 workout ≈ 346 kcal, the unconfirmed Sep 24 Strength candidate is not counted); 5. Strength detail (Sep 23 confirmed, Sep 24 candidate) remains healthy; 6. no Cardio workout appears as a Training Logger session.

## What remains untested / pending
**Indoor-vs-Outdoor type fidelity is NOT tested by these four historical walks** (their stored payloads lack the signal, so they are generic by construction and must never be corrected by inference). It is validated only by the first NEW post-activation Apple Watch Cardio workout that carries `isIndoorWorkout` metadata (tomorrow at the earliest) — **status: PENDING**; I did not attempt to trigger or simulate it. Strategic-evidence eligibility for Cardio remains a later, separate project.

## Flags
AUTHORITY_REVERIFIED · AUTHORIZED_FOUR_IDENTITIES_EXACT · SERIAL_RECONCILIATION_ORDER_RECORDED · OBS1_DRYRUN_PASS · OBS1_APPLY_PASS · OBS1_VERIFY_PASS · OBS2_DRYRUN_PASS · OBS2_APPLY_PASS · OBS2_VERIFY_PASS · OBS3_DRYRUN_PASS · OBS3_APPLY_PASS · OBS3_VERIFY_PASS · OBS4_DRYRUN_PASS · OBS4_APPLY_PASS · OBS4_VERIFY_PASS · FOUR_DEFERRED_CARDIO_RECONCILED · FOUR_CANONICAL_CARDIO_WORKOUTS_CREATED · WHOLE_DAY_ACTIVITY_TOTALS_INVARIANT · WORKOUT_NONWORKOUT_DECOMPOSITION_PASS · NO_DOUBLE_COUNT_PASS · NO_CARDIO_LOGGER_LINK_CLAIM · STRATEGIC_STATE_UNCHANGED (only the intended HealthKit reconciliation collections changed) · POLICY_CARDIO_STRENGTH_UNCHANGED · HISTORICAL_INDOOR_OUTDOOR_NOT_INFERRED · GH_REPORT_PUBLISHED
PROSPECTIVE_TYPE_FIDELITY_ACCEPTANCE_PENDING = true · PRODUCTION_MUTATED = true (four guarded reconciliations, each with its audit row; nothing else)

## Disk (STANDING_DISK_SAFETY)
No heavy operation; free space ~20 GiB throughout (floor 15). Owner-only local files (raw observation ids, per-entry expected snapshots and outputs) remain only in the agent's job temp directory and are not committed. No raw observation id, credential, database binding or Founder evidence appears in this report.
