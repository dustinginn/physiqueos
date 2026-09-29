# Native confirmation failure root-caused; token-refresh retry fix prepared and reviewed

Generated: 2026-09-26T21:15:00Z

Task: continuation of `claude-healthkit-strength-postdeploy-confirmation-failure-and-review-notifications-20260926`, following the Founder's explicit correction that the real "Use Logger session 1" confirm action — not "Refresh Review" — was used and failed identically. This report supersedes the "best-evidenced explanation" in `agent-handoffs/reports/20260926T200000Z-healthkit-strength-postdeploy-failure-and-notification-audit.md`, which is now proven incorrect by direct evidence.

## Result

**Root cause proven with decisive server-side evidence, not inference. A Native code defect is implicated. An isolated, minimal, tested, fresh-context-reviewed fix is prepared as a new candidate (`aa165ca9`, based on `efcb8574`). Not deployed, not uploaded, no device operated. The Founder's notification requirement is retained and unchanged from the prior report.**

## What changed since the prior report

The prior report's "best-evidenced explanation" (that "Refresh Review" was used instead of the real confirm action) is **incorrect and withdrawn**. The Founder has explicitly confirmed the real confirm action ("Use Logger session 1") was used and failed identically, with no further retry requested. This report treats that as fact and does not ask for another attempt.

## Decisive new evidence

1. **Server request telemetry, re-examined with a wider log window** (App Platform run logs, deployment `13d69b55`, `2026-09-26T18:10:00Z`–`18:29:59Z`): a `401 ACCESS_TOKEN_EXPIRED` rejection at `18:29:34.902Z`, followed **190ms later** by a successful token refresh (`native.auth.refresh_succeeded`, `18:29:35.093Z`). No further command-related log entry of any kind follows for the rest of the available window.
2. **Direct, bounded, read-only query of the `physiqueos.command_receipts` table** for this owner and `command_type = 'workout-reconciliation.resolve.v1'`: **zero rows exist, ever, at any status.** The same query for all command receipts of any type in the preceding two hours shows only five `healthkit.observations.ingest.v1` rows (automatic background sync), each completing in the same instant it was created. **No write command of any kind — weight, training, evidence review, or workout reconciliation — was durably processed by the server in this window except automatic HealthKit ingestion.**

Together, these two facts are decisive: the confirm command **never reached the point of being durably tracked server-side at all** — not "processed and stuck," not "processed and silently lost," but never inserted into the command-receipt ledger in the first place. This rules out, with certainty rather than inference: a stuck/orphaned "processing" receipt, a server-side idempotency or concurrency defect, and any completed-but-unacknowledged mutation. It is fully consistent with — and only with — the request being rejected at the authentication layer (before the command dispatcher ever runs) or failing at the network transport layer before ever reaching the server a second time.

## Root cause

**Native's write-command retry-after-token-refresh path gives the confirm exactly one attempt after a successful refresh, with no further resilience if that single retry itself fails.**

`ProductionNativeAPI.submitCommand` (`ios/PhysiqueOS/Networking/FounderServerAPI.swift`), the single dispatch point every write command funnels through (including `resolveWorkoutReconciliation`): on a `401` classified as a refreshable auth problem, it calls `refreshAccessToken()` — which is correctly single-flighted (actor-isolated, no race window) — and then retries the POST **exactly once** with the refreshed token. The low-level transport wrapper (`perform`) is a genuine catch-all: any thrown error from `URLSession` (a dropped connection, a timeout, any transport-layer hiccup) is converted to `ProductionNativeError.networkFailure`, indistinguishable from any other transport failure. If that single post-refresh retry hits its own transport failure — for any reason, unrelated to the token that was just fixed — `submitCommand` gives up entirely. Nothing further is attempted automatically, and because the request never reached the server this second time either, there is genuinely nothing for the server to log — exactly matching the observed evidence.

**A secondary, independent, lower-priority code-quality observation** (not implicated in this specific incident, since the command-receipts evidence proves the request never got far enough server-side to produce a `.pending` outcome): `EvidenceReviewAPI.swift`'s `resolveWorkoutReconciliation` collapses a `.pending` command outcome into the same generic `ProductionNativeError.networkFailure` as a raw transport failure. Elsewhere in this same codebase (`HealthKitServerUploader.swift`, `ProductionEvidenceIntakePipeline.swift`), a `.pending` outcome is deliberately given its own distinct handling — a documented design principle ("acceptance unknown; callers must refresh/poll... and must not offer a blind mutation retry"). This one call site doesn't follow that established pattern. It did not cause this incident (proven: zero receipts ever existed, so `.pending` was never actually returned), but it is worth hardening to the same standard as a follow-up, since a future scenario where the server genuinely does return `.pending` would hit exactly this same collapsed, ambiguous handling.

## Fix prepared (not deployed, not uploaded)

**Candidate**: `aa165ca9`, branch `codex/healthkit-token-refresh-retry-hardening`, isolated worktree based on exact `efcb8574d38d7462c3e2ccb0fd0e04ccb936517d` (the intended, currently-parked Build 61 Native lineage — installed production Build 60 is the older, unrelated `00321dcc6dd86a6479dbca5dd27e691c87348cd8`).

**Change**: `submitCommand`'s single post-refresh retry now survives one additional transient transport failure. If the retry itself throws `ProductionNativeError.networkFailure`, one bounded extra attempt is made — same encoded body, same headers (including the `Idempotency-Key`), same refreshed bearer token. This is safe by the function's own existing idempotency contract: the server's `command_receipts` table enforces `(user_id, idempotency_key)` uniqueness with `ON CONFLICT DO NOTHING`, so a genuine duplicate delivery is either the sole successful insert or safely replays the first successful attempt's outcome — verified directly by reading `PostgresCommandStore.js`'s implementation, not merely assumed. The fix applies uniformly to every command type routed through `submitCommand` (weight, training, evidence review, workout reconciliation, operating-plan, etc.), with no command-specific special-casing needed.

**Tests**: a new regression test (`testProductionCommandSurvivesTransientFailureOnTheRetryAfterRefresh`) reproduces the exact sequence — 401 expired → successful refresh → simulated dropped connection on the first retry → success on the second — and asserts the idempotency key is identical across both retry attempts. Verified RED against the original single-retry code (fails with `networkFailure`, reproducing the exact production symptom) and GREEN with the fix. Full `FounderServerAPITests.swift` suite: **202/202 passing**, no regressions, on an iPhone 17 Pro simulator.

**Fresh-context review verdict: APPROVE WITH NOTES.** Independently confirmed the described single-retry behavior against both the original (`efcb8574`) and fixed (`aa165ca9`) source; independently confirmed `refreshAccessToken`'s single-flight coalescing genuinely prevents a concurrent-refresh race (no exploitable window, verified via the actor-isolation guarantee); independently ran the full test suite (202/202) and independently reproduced the RED/GREEN swap itself, confirming the worktree was left clean afterward. Flagged, as a residual assumption outside this worktree's visibility (the reviewer did not have server source): whether the server safely handles two identical-idempotency-key requests where the first is still genuinely in-flight when the second arrives — **this has since been independently confirmed safe by this report's own direct reading of `PostgresCommandStore.js` and `executeIdempotentCommand.js`** (an atomic `ON CONFLICT DO NOTHING` insert, with a losing racer correctly re-fetching and replaying the winner's receipt) and is further serialized per-owner by an advisory lock (`pg_advisory_xact_lock`) acquired at the start of every canonical-persistence command. The reviewer's other flagged alternative (the `.pending`/missing-result path being the true cause) is the secondary observation above, and is ruled out as the cause of *this* incident by the zero-receipts evidence, though it remains worth hardening independently.

## Updated Build 61 recommendation

**Native is now implicated. `aa165ca9` (a reviewed descendant of `efcb8574`) should become the intended Build 61 candidate, superseding the plain `efcb8574` reference, once Founder separately authorizes Native work.** The fix is orthogonal to and fully compatible with everything else already in `efcb8574` (Active Goal V3 content, Performance Phase 2, local-day correctness) — it touches only `submitCommand`'s retry block and adds one test, nothing else. Patching the much older, currently-installed Build 60 lineage directly instead would mean re-deriving this same fix against stale code lacking every other already-validated improvement in the `efcb8574` line — carrying it forward on `efcb8574` is the more coherent choice. **Not prepared, archived, or uploaded as an actual build in this task, per its explicit scope** — this is a reviewed source candidate only, awaiting separate Founder authorization for any release action.

## Notification requirement — retained, unchanged

The Founder's requirement stands exactly as captured in the prior report (`20260926T200000Z`): PhysiqueOS should notify when automatic HealthKit sync/reassessment creates a new Founder-facing workout-reconciliation review, rather than relying on manual discovery. That audit found existing, directly reusable local-notification infrastructure (specifically `BriefingReadyNotifier`'s diff-against-persisted-observed-ids pattern) that satisfies every stated requirement — dedup/idempotency, no-notify for auto-canonicalized Cardio, no-notify on mere recompute, deep-link via the existing `AppDestination.evidenceReview` type, the existing `PriorityNotificationCategory.evidenceReviewReady` category — with **no server-side change needed**. That design is unchanged by today's findings and remains a precise, ready-to-implement follow-up for whenever Native work is next authorized (naturally, the same `aa165ca9`-based lineage this report recommends for the retry fix).

## Zero-write methodology

Every production read in this task used the same bounded, owner-scoped `REPEATABLE READ READ ONLY` transaction contract as every prior report in this lane (explicit `ROLLBACK`, verified `transaction_read_only = on`), plus reads of already-existing, non-sensitive App Platform structured application logs. The `command_receipts` query is a direct, parameterized, owner-scoped `SELECT` inside the same read-only transaction — no different in kind from every other production read in this lane, just against a different table. No write of any kind was attempted or reached at any point.

## Mutation and scope ledger

- Manual reconciliation/replay performed: **NO**.
- Production data mutated: **NO**.
- Workout policy / strategic eligibility changed: **NO**.
- Historical artifacts regenerated: **NO**.
- Founder device operated: **NO**.
- Server deployed: **NO**.
- Native Build 61 prepared/archived/uploaded: **NO** (source candidate only).
- Founder asked to retry: **NO** — explicitly not done, per instruction.

## Flags

- AUTHORITY_REVERIFIED: YES
- ZERO_WRITE_DIAGNOSIS: YES
- PRIOR_EXPLANATION_WITHDRAWN: YES (Refresh-only theory disproven by Founder's correction)
- COMMAND_RECEIPT_TABLE_QUERIED: YES (0 rows, ever, for this command type)
- ROOT_CAUSE_PROVEN: YES (single-retry-after-refresh has no resilience to a second transport failure)
- SERVER_SIDE_DEFECT_RULED_OUT: YES (idempotency/concurrency confirmed safe by direct code reading)
- NATIVE_DEFECT_PROVEN: YES
- FIX_PREPARED: YES (`aa165ca9`, based on `efcb8574`)
- FIX_SCOPE_MINIMAL: YES (one function, one test file)
- TESTS_RED_GREEN_PROVEN: YES
- BROADER_REGRESSION_SWEEP_PASSED: YES (202/202)
- FRESH_CONTEXT_REVIEWED: YES (APPROVE WITH NOTES)
- SECONDARY_PENDING_HANDLING_GAP_FLAGGED: YES (not implicated in this incident; follow-up only)
- BUILD61_CANDIDATE_UPDATED: YES (`aa165ca9` recommended in place of plain `efcb8574`)
- NOTIFICATION_REQUIREMENT_RETAINED: YES (unchanged from prior report)
- SERVER_DEPLOYED: NO
- NATIVE_BUILD61_PREPARED: NO
- NATIVE_BUILD61_UPLOADED: NO
- FOUNDER_DEVICE_OPERATED: NO
- FOUNDER_ASKED_TO_RETRY: NO
- PRODUCTION_DATA_MUTATED: NO
- GH_REPORT_PUBLISHED: YES
