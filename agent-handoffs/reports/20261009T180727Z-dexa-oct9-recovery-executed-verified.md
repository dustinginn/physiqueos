# October 9 DEXA: fix deployed, recovery executed, production verified — COMPLETE

- Task id: `claude-dexa-oct9-deploy-and-recovery-execution-20261009`
- Authorization: Founder authorization (DEXA October 9), received 2026-10-09 in the Claude B session. It covers the guarded Server-only deploy of exact `539f7006…` and the single-insert recovery `dexa-2026-10-09-continuation-recovery-v1` under reference **FOUNDER-DEXA-OCT9-APPLY-20261009**.
- Packet: `20261009T175147Z-dexa-oct9-founder-authorization-packet.md` (main `ec8e282c`)
- Generated: 2026-10-09T18:07Z

## Result

| Question | Answer |
|---|---|
| Fix deployed? | **Yes.** Server `539f7006010989a1c58797b582ac003798cfdd64`, deployment `0e18ece1-cbb9-4587-9657-6f2ef56b50a3`, ACTIVE 9/9 |
| Recovery executed? | **Yes.** Exactly **1** row inserted at 18:02:41Z |
| Production verification passed? | **Yes.** Postflight `complete` with 13/13 checks, and an independent before/after state capture matches expectations with **no deviations** |
| Further Founder action required? | **No** for this incident. Optional: on-device check (below) and the P1 follow-up |

## 1. Deployment (authorized step 1)

| Gate | Evidence |
|---|---|
| Pre-checks | Local and remote candidate = `539f7006`, clean tree; deploy branch at `e03f6768`; fast-forward confirmed; production `e03f6768`/`69a8dc14` ACTIVE and ready, nothing in progress |
| Push | Non-force fast-forward of `combined-app-platform-cutover` from `e03f6768` to `539f7006`; remote head verified before any spec change |
| Spec | Exactly 4 values changed: `PHYSIQUEOS_GIT_SHA` and `PHYSIQUEOS_BUILD_ID` on web and worker (→ `539f7006…`, `physiqueos-539f7006-20261009`). Programmatically asserted that nothing else in the spec changed; branch, instance size (`apps-s-1vcpu-1gb-fixed` ×1) and all other env are identical. |
| Build | `create-deployment --force-rebuild` with `physiqueos-production-deploy`. The spec-update deployment (`efda941e`) was superseded, as is standard. `0e18ece1` went from BUILDING to ACTIVE 9/9 in about 4.5 minutes (17:56–18:01Z). |
| Verification | Web and worker `source_commit_hash` = `539f7006` (exact); ready `physiqueos-539f7006-20261009`, migration **000014 unchanged**, runtime authority ready; live 200; fresh log envelopes `gitSha` = `539f7006` on **worker** (boot and cadence) and **web** (one harmless unauthenticated refresh probe, 401) |
| Scope | No migration; Recovery remains OFF (no activation code or data touched); no Native, TestFlight, infrastructure or size change |
| Rollback anchor | `e03f6768` (unused) |

## 2. Recovery (authorized step 2)

| Gate | Evidence |
|---|---|
| Fresh read-only preview on `539f7006` | Built by the candidate's own builder (which now accepts the fixed SHA); `REPEATABLE READ READ ONLY`, `transaction_read_only = on`, ROLLBACK, marker once. `insert_continuation`, **no drift**: every sealed fact matched the 17:39Z and 17:46Z previews (review v12, canonical rev 1 at row version 1, appointment v5, one dead message with 4 attempts, no live sibling). Seal digest `bdfc661ec6e3ff690576561b760b25f601249aaadfba1d810d98ce73cf1a692a`. |
| Before-state | Independent read-only capture: review v12 `committing`; appointment v5 `scheduled`; legacy DEXA rows 17 (none for 10-09); analyses 423; daily briefings 58 (4 DEXA Events); Confidence history 33, active snapshot pointer ref `51d59b9886ca`; two Apple Health receipts (revision 1); PDF media verified |
| APPLY | Payload built with the seal and reference FOUNDER-DEXA-OCT9-APPLY-20261009. Ran under the owner lock with row-locked re-reads and seal re-match. Outcome **`applied`, rowsChanged 1**: new `evidence.review.continue` message (ref `f636c0586fa9`), pending, attempt 0. Exit 0, empty stderr, marker once. |

## 3. Resumed pipeline (fixed code, worker)

| Time (UTC) | Progress (read-only postflight) |
|---|---|
| 18:03:02 | `compatibility_writes` succeeded **on its first attempt on the fixed Server**. This is the step that killed the worker and the web process on Oct 9. |
| 18:03:59 | 4/9 steps complete |
| 18:04:56 | 6/9 |
| 18:05:52 | 8/9 |
| 18:06:48 | **9/9: `complete`**, review `confirmed`, 0 live continuations |

Worker logs: exactly 8 `outbox.succeeded`, **0 errors, 0 restarts** (one boot, at the deploy). Web: no errors.

## 4. Postflight (13/13 OK)

| Check | Result |
|---|---|
| owner matches seal / review matches seal | OK |
| recovery message present (`succeeded`) | OK |
| canonical_commit not replayed (1 attempt) | OK |
| canonical DEXA single, unchanged (revision 1) | OK |
| Apple Health receipts unchanged | OK |
| all 9 steps completed | OK |
| exactly one legacy DEXA row | OK |
| appointment completed exactly once by the Oct 9 canonical scan | OK |
| DEXA analysis present / Goal evaluation present | OK / OK |
| exactly one DEXA Event briefing | OK |
| no live continuation | OK |

## 5. Before → after (independent read-only capture, 18:07Z)

| Record | Before | After | Expected? |
|---|---|---|---|
| Review `7945415503f5` | v12 `committing`, `native-confirm` claim expired, 1/9 steps | v44 **`confirmed`**, claim completed, **9/9** steps (canonical_commit 1 attempt; compatibility_writes counter 4, including the 3 crashed attempts) | Yes |
| Legacy DEXA read model | 17 rows, none for 10-09 | 18 rows, **exactly one** for 10-09 (the Oct 9 object); other rows' versions unchanged | Yes |
| Appointment `execution_next_dexa` | v5 `scheduled`, active, 1 completion entry, executionRevision 3 | v6 **`completed`**, inactive, completed at 18:03:15Z by the Oct 9 canonical scan, **2** entries (+1), executionRevision 4 | Yes |
| Legacy execution `execution_dexa` | v4 | v4 (untouched) | Yes |
| Analyses | 423 | **425**: +1 DEXA interpretation (Oct 9 vs prior), +1 Goal evaluation; nothing removed | Yes |
| Daily briefings | 58 (4 DEXA Events) | **59** (5 DEXA Events): +1 for this scan | Yes |
| Goal Confidence | history 33; active snapshot → `51d59b9886ca` | history **34**; active snapshot → `20846cbb6e3d`, **originating artifact = this DEXA Event** | Yes. Confidence updated. |
| Continuations for the review | 1 dead | 1 dead (untouched history) + **8 succeeded** (1 recovery + 7 system) | Yes |
| Canonical DEXA records | 5 (4 active, 1 superseded); Oct 9 revision 1 row v1; prior active 07-18, 08-15, 09-12 | **identical** | Preserved |
| Canonical evidence objects | 598 | 598 | Preserved |
| Intake receipt / PDF media | stored and completed v5 / verified PDF | **identical** | Preserved |
| Apple Health receipts | 2 (Body Fat %, Lean Body Mass fat-free; revision 1) | **identical**; no new HealthKit write | Preserved |
| Runtime revision | 5695 | 5732 (the pipeline's write transactions plus routine activity) | Yes |

As disclosed in the packet, the existing collection-scoped writers re-saved `analyses`, `dailyBriefings` and the Goal Confidence collections with unchanged content (row versions +1). No evidence was re-uploaded, duplicated or deleted.

**Deviations from the packet: none.**

## 6. What the Founder should now see (Build 93)

After the app refreshes:
- Log: the October 9 "Processing" row is resolved.
- Home: the DEXA appointment priority is cleared, because the appointment is completed.
- An October 9 **DEXA Event briefing** is available.
- Progress/DEXA shows the October 9 scan.
- Goal Confidence reflects the DEXA Event assessment.

Nothing needs to be re-uploaded or marked complete. Optional: confirm these on device; report anything that does not refresh.

## 7. Follow-ups (no action taken)

- **P1 Server:** bound the confirmation-entry durable-resume proof. It is the one remaining whole-runtime load per continuation, and it succeeded throughout this recovery.
- Backlog items already recorded for the next Native build are unchanged: direct DEXA upload action, adaptive priority cards, and Log staleness copy.

## Separation statement

The only production mutations were the two authorized actions:
- the deploy of exact `539f7006` (4 spec stamp values plus a rebuild);
- one outbox INSERT,

followed by the normal fixed-code pipeline the review was already entitled to. There were no additional corrections, no Native or TestFlight work and no infrastructure change. No release pointers were moved: `latest.*` remains the Build 93 release authority. All production reads were `REPEATABLE READ READ ONLY`, verified, SELECT-only and rolled back. Seal material and raw outputs stay in local mode-600 scratch.
