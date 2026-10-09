# October 9 DEXA: Founder authorization packet — **GO recommended**

- Task id: `claude-dexa-oct9-founder-authorization-packet-20261009`
- Continues: execution-gate HOLD `20261009T174628Z` (main `bb6cd487`)
- Generated: 2026-10-09T17:51Z
- **This packet executes nothing.** No production write, deploy, or Native build has occurred. Production state and gates were re-verified read-only at 17:45–17:51Z.

## 1. Two separate things are being authorized

| | A. DEXA confirmation **fix** (code) | B. October 9 **recovery** (data) |
|---|---|---|
| What | Server `539f7006010989a1c58797b582ac003798cfdd64` = deployed `e03f6768` + 5 commits. DEXA-only confirmations read and write only the records each step uses, so the Oct 9 memory crash cannot recur. A Native retry no longer runs a step inside the web request. The briefing digest is streamed, with identical values. Adds recovery tooling and a memory harness. | One guarded operation that resumes the single stuck review by inserting **one** continuation message. The deployed (fixed) Server then completes the remaining 8 steps exactly as a normal confirmation would. |
| Needs a deployment? | **Yes.** Server-only: web + worker. | **No** deployment of its own. It runs as a console payload through the approved runner, but **requires A to be live first**: the apply builder refuses any Server without the fix. |
| Schema change? | **No.** No `db/` change; migration level stays at 000014. | **No.** |
| Native / TestFlight? | No | No |
| Additional cost? | No new resources and no instance or size change (web and worker stay `apps-s-1vcpu-1gb-fixed` ×1). One App Platform rebuild of the existing app. | None |
| Reversible? | Yes. Redeploy `e03f6768` (no schema to unwind). | **Forward-only** (see §5). |

## 2. Authority and safety confirmations

| Item | Status |
|---|---|
| Production authority | Server `e03f6768627f49175c476208eca79c99ae3d5ee9` on web and worker; deployment `69a8dc14-461f-4680-91a3-14e42522494f` ACTIVE; ready; no in-progress deployment |
| Deploy path | Branch `combined-app-platform-cutover` is at `e03f6768`; `539f7006` is a 5-commit **fast-forward** (non-force push). Context `physiqueos-production-deploy` authenticates (read-verified). |
| Read and execution runner | Approved Mac console runner (blob-verified against `4025f175`), context `physiqueos-final-cutover-config`, component `web` |
| Database scope | Founder owner only, taken from the runtime binding (no identifier in source). The review is discovered from its 2026-10-09 DEXA intake receipt. |
| Read-only audits (all `REPEATABLE READ READ ONLY` with `transaction_read_only = on`, SELECT-only, ROLLBACK) | Triage `2f903439`; preview 17:39Z; drift preview 17:46Z; affected-records probe 17:51Z. **All consistent, no drift.** |
| Focused regression on `539f7006` | **191/191** (13 files, including 120 new DEXA tests); real-PostgreSQL (PGlite) **21/21**; full unit suite and migration-safety show **0 new failures**; Next.js production build, middleware verification and artifact privacy scan **PASS**; the worker artifact imports the fix |
| Memory | Every remaining step on the fixed Server grows less heap than the unchanged confirmation entry load, which already succeeds in production at today's 62.3 MB runtime (560 MB heap). Residual: the entry load itself (§6). |

## 3. Exact production records affected (current → after)

Identifiers are shape-only, or 12-hex SHA-256 references that correlate with earlier reports.

**Written by the recovery itself (operation B), exactly one row:**

| Record | Now | After | Why |
|---|---|---|---|
| `outbox_messages`: new `evidence.review.continue` message for review `7945415503f5` | Absent; only one **dead** message exists (`50adcf879b9b`, 4 attempts), with no live sibling | **+1 row**: `pending`, attempt 0, null operation, payload `{reviewId, continuationKey}`, checkpoint `canonical_commit:compatibility_writes:started:3` | The dead message's key predates the Native retry, so resetting it would be a silent no-op. This is the message the system itself would have enqueued. The dead message is left untouched as history. |

**Written afterwards by the deployed, fixed confirmation code (steps 2–9, normal product writes):**

| Step | Record | Now | After | Why |
|---|---|---|---|---|
| compatibility_writes | `dexaScans` row for the Oct 9 evidence object | absent (17 rows; none for 10-09) | **+1 row**, version 1, carrying canonical id `dexa_scan\|<owner>\|2026-10-09`, revision 1 and goal-phase attribution; no other DEXA row touched | Progress and DEXA screens and the DEXA briefing read this row |
| scheduled_completion | `executionItems/execution_next_dexa` | v5: `scheduled`, active, date 2026-10-09, 1 prior completion entry, executionRevision 3 | v6: `completed`, inactive, completedBy = the Oct 9 canonical scan, completedEvidenceDate 2026-10-09, **2** completion entries, executionRevision 4. `execution_dexa` (v4) untouched. | Clears the DEXA appointment priority, which is still showing |
| analysis | `analyses` | 423 rows; none for the Oct 9 scan | **+1** DEXA interpretation (Oct 9 vs prior scan). The existing writer rewrites the collection in one transaction: **423 existing rows keep identical content with version +1**; no row removed (no analysis shares its evidence target). | Adds the DEXA interpretation |
| goal_evaluation | `analyses` | no `goal_evaluation_<package>` | **+1** Goal evaluation; same collection rewrite (versions +1, content unchanged, nothing removed) | Goal state reflects the new scan |
| training_performance_events, event_eligibility, home_refresh | none | unchanged | unchanged | Not applicable to DEXA, or compute-only |
| briefing | `dailyBriefings`; `goalConfidenceHistory`; `goalConfidenceSnapshots` | 58 briefings (4 prior DEXA Events, none for this scan); 33 history; 2 snapshots (one for the active goal and phase) | **+1** DEXA Event briefing for this scan. **+1** Confidence assessment (successor) in history, and the active goal-phase snapshot advanced to it. The bounded publication rewrites those collections: existing rows keep content, versions +1. | The DEXA Event briefing and the Confidence update a confirmed DEXA produces. This is what would have happened at 07:25 PT without the crash. |
| (every step) | Review `7945415503f5` | v12 `committing`; steps `canonical_commit` completed/1, `compatibility_writes` started/3; claim `native-confirm`, expired | `confirmed`; all 9 steps completed; canonical_commit attempts still **1** | Ends "Processing" in Log |
| (every step) | Outbox | 1 dead | +7 more continuation messages enqueued by the system, one per step (8 including the recovery's), all ending `succeeded` | Normal one-step-per-message continuation |
| (every write) | `canonical_runtime_metadata.revision` | 5695 (moves with routine activity) | Advances once per write transaction | Optimistic-concurrency revision |

**Explicitly NOT touched:**
- the canonical DEXA scan (`dexa_scan|<owner>|2026-10-09`: revision 1, row version 1, active), plus the other 4 canonical DEXA records, including the 1 superseded record and its revision exclusions;
- the 598 canonical evidence objects and the other 17 legacy DEXA rows;
- the intake receipt (`d98dab5f8e69`, stored/completed);
- the PDF media object (verified, `application/pdf`) and its association;
- both Apple Health writeback receipts (Body Fat %, Lean Body Mass fat-free, revision 1). **No new Apple Health write.**
- all other evidence types, reviews and messages.

## 4. Expected mutation count

- **Operation B (recovery): exactly 1 INSERT, 0 updates, 0 deletes.** It is fenced by owner lock, row-locked re-read and an exact seal match; drift is refused.
- **Steps 2–9 (fixed code, after B):**
  - **3 new canonical records:** the legacy DEXA row, DEXA analysis and Goal evaluation;
  - **1 new DEXA Event briefing** and **1 new Confidence assessment**;
  - **1 appointment update** and the snapshot update;
  - review progress updates;
  - **7 system continuation messages**.

  The existing collection-scoped writers additionally version-bump, with content unchanged:
  - `analyses`, twice (423 → 425 rows);
  - `dailyBriefings` (58 → 59);
  - `goalConfidenceHistory` (33 → 34);
  - `goalConfidenceSnapshots` (2).

  Nothing is deleted.

## 5. Rollback strategy

- **Fix (A):** if health or ready, the worker, or behavior regresses, redeploy `e03f6768` the same way: spec stamps plus force-rebuild. There is no schema change, and everything the fix writes is the same shape the previous code writes.
- **Recovery (B): forward-only by nature.** Its effects are the ordinary records of the DEXA confirmation the Founder already made at 07:25 PT.
  - The worker claims the inserted message immediately, so there is no practical abort window.
  - If any step fails: the message dead-letters, the review becomes `partially_committed`, writing stops at that step, and earlier steps' correct records remain.
  - Diagnose before any further action; there are no blind retries.
  - Undoing confirmed records would need its own separately authorized correction. A before/after read-only state capture (this packet's probe, repeated immediately before APPLY and after completion) is the forensic baseline.
- **Stop conditions:** any preview or apply refusal (including `SEAL_DRIFT`), health/ready failure after deploy, a `source_commit_hash` or log `gitSha` mismatch, or a postflight `failed` or `complete_with_discrepancies`.

## 6. Residual risk (accepted or declined by the Founder)

- Each continuation invocation still begins with one whole-runtime load: the durable-resume proof, unchanged and shared by every evidence type.
  - It already succeeds in production at today's size, including at least four times on Oct 9.
  - Its exact headroom is unknown: the effective baseline is calibrated at about 245–329 MB against the 560 MB heap.
- If it fails during recovery, postflight shows `failed`, the review is `partially_committed`, and nothing is silently corrupted.
- Bounding it is recommended as the next Server change; it is not required for this recovery.

## 7. Execution sequence (only after authorization)

1. **Re-verify** production is `e03f6768`/`69a8dc14` with nothing in progress, and the branch head is `539f7006`.
2. **Deploy:**
   - fast-forward push `539f7006` to `combined-app-platform-cutover` (non-force);
   - `apps update --spec` bumping only `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker;
   - `create-deployment --force-rebuild` (production-deploy context).
3. **Verify the deploy:** web and worker `source_commit_hash` = `539f7006`; a fresh log `gitSha` on both; health/live and ready; **stop** on any mismatch.
4. **Fresh read-only preview** on `539f7006`. It must match this packet's fences: review v12, canonical rev 1, appointment v5, one dead message and no live sibling, legacy row absent, no analysis or briefing, two Apple Health receipts. Then the read-only before-state capture.
5. **APPLY:** exactly one INSERT under the authorization reference.
6. **Postflight** (read-only) until `complete`:
   - review confirmed, 9/9 steps, canonical_commit attempted once;
   - canonical scan unchanged at revision 1;
   - Apple Health receipts unchanged;
   - exactly one legacy row; appointment completed once;
   - DEXA analysis and Goal evaluation present; exactly one DEXA Event briefing;
   - no live continuation.

   Then the read-only after-state capture and a published final report.

## 8. Recommendation: **GO**

All safeguards pass, nothing has drifted since 14:59Z, and the only open item is your authorization. Suggested exact wording, to send as one message:

> **Founder authorization — DEXA October 9:** I authorize Claude to (1) deploy exact Server `539f7006010989a1c58797b582ac003798cfdd64` to production as a guarded Server-only deployment: fast-forward push to `combined-app-platform-cutover`, spec stamp update of `PHYSIQUEOS_GIT_SHA`/`PHYSIQUEOS_BUILD_ID` on web and worker, and force-rebuild via `physiqueos-production-deploy`, with rollback anchor `e03f6768`, no migration, Recovery OFF, and no Native or TestFlight change; and (2) after verifying that deployment and a fresh read-only preview with no drift, execute the single-insert recovery `dexa-2026-10-09-continuation-recovery-v1` under authorization reference **FOUNDER-DEXA-OCT9-APPLY-20261009**, then run read-only postflight to completion. Stop and report on any refusal, drift, mismatch or failure.

If you want the fix without the recovery, authorize (1) only. If you do, the review stays stuck until (2) is given.

## 9. Remaining blockers

- **Only the Founder authorization above.** There are no technical blockers.
- Until then: do not re-upload, re-confirm, or Mark Complete or Skip the DEXA priority.
