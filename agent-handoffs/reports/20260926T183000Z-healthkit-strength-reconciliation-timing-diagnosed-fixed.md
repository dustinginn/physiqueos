# Sep24 Strength reconciliation confirmation defect — diagnosed, fix prepared

Generated: 2026-09-26T18:30:00Z

Task id: `claude-healthkit-strength-reconciliation-new-thread-20260926`

Agent: Claude (Remote Control, HealthKit lane, new thread per handoff `agent-handoffs/inbox/prompts/20260926T172500Z-claude-healthkit-strength-reconciliation-new-thread-handoff.md`)

## Result

**Root cause proven, isolated one-condition fix prepared, tested, and independently fresh-context reviewed — APPROVE WITH NOTES. Not deployed.** The Founder's "Use Logger session 1" confirmation for the Sep 24 Strength workout could not have succeeded at the time it was attempted, because the server-side record it needed to update did not durably exist yet — a genuine timing gap in when the reconciliation review gets created, not a data-corruption or safety issue. The prospective Cardio acceptance from earlier today remains PASS and untouched; strategic eligibility remains quarantined throughout.

## Authority reverified

- Production Server: `2a23eee762472081815d9122b97c0f0a9f1b8969` — unchanged, still live throughout this diagnosis.
- Installed Native: Build 60, `00321dcc6dd86a6479dbca5dd27e691c87348cd8` — unchanged, not operated.
- Intended unreleased Build 61 lineage: `efcb8574d38d7462c3e2ccb0fd0e04ccb936517d` — unchanged, not prepared, not uploaded.
- Workout policy: `[cardio, strength]`, quarantined, `historicalBackfill: false`, `linkAutoConfirm: false` — reverified unchanged throughout.

## Zero-write status

Every production read in this diagnosis used the established bounded, owner-scoped, `REPEATABLE READ READ ONLY` transaction with a verified `transaction_read_only = on` fence and an explicit `ROLLBACK` — no write of any kind was attempted or reached. The one "mutation-adjacent" action taken was purely in-memory and read-only: re-running the exact production confirmation guard function (`assertHealthKitWorkoutRelationshipConfirmationAllowed`) against already-fetched data inside the same read-only transaction, to see what it would decide right now — this calls no database write path and is the same safe technique used throughout this lane for live rule verification.

## Root cause

**The reconciliation review row for the Sep 24 Strength workout's Logger match was never durably created until Sep 26 — roughly two days after the fact — because of a timing gap in when the server re-evaluates Strength candidates, not any defect in the confirmation logic itself.**

The mechanism, proven by direct code reading and confirmed independently by fresh-context review:

- `reassessWorkoutRelationships` (`src/application/commands/CanonicalPersistenceCommandPorts.js`) is the only code path that creates a Founder-facing `evidenceReviews` row for a "possible match" Strength candidate. Before this fix, it only ran when the *current* HealthKit ingestion batch itself contained a new workout observation (`if (batchHadWorkout && workoutPolicy.enabled)`).
- The Sep 24 Strength workout's Logger session commits via a completely separate, independent submission path (the Workout Logger, not HealthKit) with its own timing — in this case about an hour after the workout ended.
- No further HealthKit *workout* observation arrived again until the new Sep 26 Outdoor Walk (already accepted as PASS in the prior report). Ordinary Activity/Nutrition daily-total observations synced continuously in between, but those don't set the flag that gates reassessment.
- So the pass that would notice "this workout now has a plausible Logger match, create a review" never ran for two days — until Sep 26's new walk finally triggered it. That reassessment pass, by its own design, re-evaluates the *entire* open-ended policy window, not just the triggering workout — so it swept up the stale Sep 24 candidate and created its review for the first time, stamped with that same batch's timestamp.

This is proven, not inferred, by direct production evidence:
- The review's `version` is `1` (never mutated past creation), `resolution: null`, `resolutionHistory: []`, and exactly one `lifecycleHistory` entry.
- That single entry's timestamp is `2026-09-26T16:46:22.824Z` — matching, to within 10 milliseconds, the completely unrelated Sep 26 Cardio workout's own canonicalization timestamp from the same ingestion batch (established independently in the prior task's Cardio acceptance audit).
- The underlying Logger-candidate link is still `status: "candidate"` — it was never promoted to `"confirmed"` at any point, consistent with a confirm command that never got past its first step (looking up a review row that did not yet exist).

## Relationship / action / queue / projection findings

- **Exact workout and Logger candidate**: the Sep 24 canonical Strength workout (`traditional_strength_training`, 2026-09-24T16:22:10Z–16:50:09Z) and its one candidate Logger session (a genuine, trusted, live Training Logger session — `logger_origin: "training_logger"`, `logger_mode: "live"`, 2 exercises, quality `active`) — matched by the live assessor at 60% confidence, `reason: "single_session_below_confident_threshold"`, unchanged from the prior task's own Cardio-acceptance audit.
- **Founder action/command/audit record**: none exists. The review's `resolutionHistory` is empty and `resolution` is `null` — no confirm command has ever durably completed against this exact review identity.
- **Idempotency/version/revision state**: review version `1` (its one and only write, the initial creation); link version `1`, status `candidate` (its one and only status, from automatic system-matcher creation) — neither has ever been mutated by a confirm attempt.
- **Canonical relationship mutation**: none occurred. The link was never promoted to confirmed; no claim was ever held for either the workout or the session.
- **Current Pending Review/queue state**: the review is genuinely, correctly `status: "pending"` — this accurately reflects that the relationship is still unresolved, not a stale or incorrect projection.
- **Current Workout Detail projection**: showing "Possible match" is the *correct* reflection of the true current database state (link status `candidate`) — this is not a stale-read or caching bug; the underlying relationship genuinely was never confirmed.
- **Exact verification condition behind "Refresh required"**: Native's `resolveWorkoutReconciliation` (`EvidenceReviewDetailView.swift`) shows this banner whenever it cannot confirm the command's outcome exactly matches the requested "resolved_confirmed" state — either because the command's own response didn't cleanly match, or (for a caught error classified as network/5xx/decode-related "uncertain") after a refetch still doesn't show the resolved state. Given the review never advanced past its initial pending/version-1 state, whatever attempt(s) the Founder made did not durably succeed at the server, for the timing reason above (a 404-style rejection is the most consistent explanation if attempted before the row's Sep 26 creation).
- **Why "Refresh Review" never converges**: tapping it only re-fetches and displays the *current* review (`load()`); it never re-attempts the confirm action itself. If the confirm never durably succeeded, refreshing can only ever show the same still-pending state, no matter how many times it's tapped — a genuine, secondary Native UX gap (a definite, non-retryable outcome should be distinguishable from "please refresh and try again"), independent of the primary Server-side timing defect.

## Root cause classification

**Combination, with the primary defect on the Server side.** (1) The Server timing gap described above is the actual reason the confirm attempt could not durably succeed. (2) A secondary, lower-severity Native gap: the client's error classification does not clearly distinguish "this specific action cannot succeed, please retry the confirm" from "genuinely ambiguous, just refresh" — worth improving, but not the root cause and not required to fix the underlying defect.

## Duplicate / idempotency risk of a retry

**A fresh retry is very likely safe.** Re-running the exact production confirmation-allowed guard against the current live link and session data, in-memory and read-only, returns a clean pass with no error — the Logger session is a legitimate trusted live session, temporally plausible, and the relationship-integrity check across all current links/claims passes cleanly (zero violations of any kind). The confirm command is also inherently idempotent by design at every step (an already-confirmed link short-circuits to `already_confirmed`; an already-resolved review short-circuits to `already_resolved` when the exact resolution matches). This is a strong, well-evidenced basis for the recommendation below — but it was not executed, per this task's explicit prohibition on Founder-device operation and manual reconciliation during diagnosis.

## Fix prepared (not deployed)

**Candidate**: `524f1882072cb5c17c4fe61f7210f0f7d1c6e67c`, branch `codex/healthkit-strength-reconciliation-timing-fix`, isolated worktree based on exact production `2a23eee7` (Server-only; no Native change).

**Change**: drop the `batchHadWorkout` condition from `reassessWorkoutRelationships`'s call site — it now runs on every HealthKit ingestion batch while the Workout policy is enabled, not only batches containing a new workout. The reassessment pass's own pre-existing comment already describes itself as "read-mostly and idempotent... bounded to its exact window," so this closes the exact gap without changing any other behavior. The now-dead `batchHadWorkout` variable and its one set-site were removed.

**Tests**: a new focused regression test reproduces the exact production sequence (workout ingested with no Logger session yet → session committed independently → only a non-workout batch follows, no further workout ever arrives) and asserts the review and candidate link are created on that non-workout batch. Verified RED against the original gate (`candidateLinksCreated: 0` instead of `1`, exactly reproducing the production symptom) and GREEN with the fix. Broader sweep: 350/350 tests passing across `src/application/native/` and `src/application/commands/` (20 files), no regressions. Two pre-existing, unrelated test failures (regex assertions against an unrelated deployment script, confirmed failing identically on the unmodified baseline) were left untouched.

**Fresh-context review verdict: APPROVE WITH NOTES.** Independently re-derived the mechanism from the code (including the exact reason for the ~10ms timestamp coincidence), independently re-ran the tests (69/69 on the target file; reproduced the RED/GREEN swap itself), and confirmed via a broader grep across every caller/test of the ingestion path that no other test depends on the old gate's behavior. Two non-blocking follow-up notes, not required for this fix:
1. **Scaling watch-item**: the reassessment pass now runs on every ingestion batch (far more frequent than workout-only batches) and scans the whole open-ended policy window; currently negligible cost given the small workout history, but worth revisiting if/when that history grows substantially.
2. **Completeness**: this fix requires *some* HealthKit ingestion batch to eventually arrive to trigger the catch-up sweep; a user who stops syncing HealthKit entirely for an extended period would still not get a review created. A scheduled, ingestion-independent catch-up sweep would close this residual gap but is not required to fix the reported defect and is not implemented here.

## Build 61 recommendation

**Build 61 does not need to wait, and `efcb8574` can remain the intended Native lineage unchanged.** This defect and its fix are entirely Server-side and touch none of the files in `efcb8574`'s lineage (Performance Phase 2, local-day correctness, Active Goal V3 layout) — there is no code overlap and no reason to fold this fix into a Native release. The Strength-reconciliation fix should be deployed on its own, independent gate, as soon as Founder authorizes it — it is not blocking, and not blocked by, Build 61's own separate authorization.

## Severity assessment

Moderate-high for user trust in a daily-driver flow (a normal confirmation action silently and repeatedly fails with no clear explanation), but **not** a data-integrity, safety, or double-counting issue — the system failed closed throughout: no duplicate link, no false confirmation, no corrupted state, no Activity/accounting impact. The underlying candidate match itself is correct and ready to confirm.

## Mutation and scope ledger

- Production mutated: **NO**.
- Manual reconciliation/replay performed: **NO**.
- Workout policy changed: **NO**.
- Strategic eligibility changed: **NO**.
- Historical artifacts regenerated: **NO**.
- Founder device operated: **NO**.
- Server deployed: **NO**.
- Native Build 61 prepared/uploaded: **NO**.

## Required Founder action

1. **Immediate, safe, no-code-change option**: reopen Pending Review for the Sep 24 Strength workout and tap "Use Logger session 1" again. Based on the live guard re-verification above, this should now succeed cleanly (the review row exists, version 1, and nothing is currently blocking confirmation) — but this is the Founder's own action to take, not something this task executed.
2. Authorize deployment of the prepared Server fix (`524f1882`, its own separate gate) so this exact gap cannot recur for a future Strength workout under the same timing conditions.
3. No decision needed on Build 61 timing as a result of this defect — it is independently authorized whenever Founder chooses, per the existing gate.

## Flags

- AUTHORITY_REVERIFIED: YES
- ZERO_WRITE_DIAGNOSIS: YES
- ROOT_CAUSE_PROVEN: YES
- REVIEW_EXISTENCE_TIMING_GAP_PROVEN: YES
- LINK_STATE_UNCHANGED_CANDIDATE: YES
- NO_DUPLICATE_OR_INTEGRITY_VIOLATION: YES
- RETRY_SAFETY_ASSESSED_LIKELY_SAFE: YES (not executed)
- FIX_PREPARED: YES (`524f1882072cb5c17c4fe61f7210f0f7d1c6e67c`)
- FIX_ISOLATED_SERVER_ONLY: YES
- TESTS_RED_GREEN_PROVEN: YES
- BROADER_REGRESSION_SWEEP_PASSED: YES (350/350)
- FRESH_CONTEXT_REVIEWED: YES (APPROVE WITH NOTES)
- BUILD61_LINEAGE_UNAFFECTED: YES (`efcb8574` unchanged, no overlap)
- SERVER_DEPLOYED: NO
- NATIVE_BUILD61_PREPARED: NO
- PRODUCTION_MUTATED: NO
- FOUNDER_DEVICE_OPERATED: NO
- GH_REPORT_PUBLISHED: YES
