# Workout Performance Record celebration audit

**Status:** diagnosis complete; bounded Native fix implemented, tested, and pushed as a review candidate

**Repository:** `dustinginn/physiqueos`

**Audit/report branch:** `codex/workout-performance-record-celebration-audit-20261001`

**Native fix branch:** `codex/workout-pr-celebration-lifecycle-fix-20261001`

**Native fix SHA:** `69cad804e2ac7d74ed98914e1601f2e7863dadc3`

**TestFlight / deploy status:** no TestFlight upload, no Server deployment, and no production mutation

## Executive finding

Today's real Founder workout did establish and persist **two** new canonical Exercise Performance Records. Both are `session_volume_pr` records. The durable `training-session.commit.v1` receipt contained both records in its `performanceRecords` result, with a schema that the accepted Native build can decode. There was no `accepted_processing` ambiguity, retry, delayed Server reconciliation, response omission, or decode incompatibility in today's transaction.

The defect is in Native presentation ownership and view lifecycle:

1. A durably completed workout's record list existed only in the current `TrainingLoggerViewModel` memory.
2. Native immediately deleted the exact local draft identity after canonical success, so navigation or process/view recreation had no durable completion-presentation state from which to re-read the records.
3. `NewPerformanceRecordsCard.onAppear` claimed the one-shot `UserDefaults` celebration key immediately, without proving that the Workout Complete surface was visible. SwiftUI may update/insert a retained tab hierarchy while another tab is on screen.
4. Production navigation reads show the Founder moved to Home immediately after the durable acknowledgement. In that timing, the hidden Workout Complete hierarchy could consume the one-shot, while the deleted draft made the card/records impossible to recover on return.

This is classified as a **Native state ownership defect + navigation/view-lifecycle defect + dedupe/one-shot timing defect**. It is not a PR computation defect, persistence defect, Server response omission, Native decode defect, or accepted-processing defect.

The candidate fix preserves only the exact just-completed draft as an explicitly pending presentation, re-reads authoritative records after view/process recreation, routes back to that pending completion, refuses to consume the celebration while the surface is hidden, and deletes the local marker only when the Founder explicitly presses **Return to Log**. Legacy/historical completions have no marker and do not replay.

## Reverified authorities

- GitHub task authority: `origin/main` at `dcce98dbe588ae09119b7abe939de67130b75df1`, including `agent-handoffs/inbox/prompts/20261001T170000Z-workout-performance-record-celebration-audit.md`.
- Production Server app: DigitalOcean app `bf57cf56-48cc-4cd6-90e4-a23ee5381741`.
- Active production deployment: `8008f928-02b6-46b0-99ab-d403b870499a`, ACTIVE with 9/9 components ready.
- Production Server source: `b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8`; build ID `physiqueos-b81c784e-20261001`; schema `000014`.
- Latest accepted TestFlight authority: Build 75, source `77681cd79c8a818dd128766d9c69121f03f9a5e3`, VALID.
- Today's device lineage is independently at least Build 74: 87 same-day `healthkit.sleep.historical-evidence.ingest.v1` receipts share the exact hashed device identity of today's training receipt, and that command first exists in Build 74. Exercise PR completion support was already integrated in Build 69 and remains present in Build 74/75. This establishes that today's app lineage contained the audited decode/presentation path even if the phone's exact installed build number is not exposed by the command receipt.
- Canonical PR model: `training_performance_event_v1`.
- Current durable/presented record families: `session_volume_pr` and `reps_at_load_pr`. A transient `heaviest_load` intelligence observation is not a durable/presented record type under the current canonical model.
- Confirmation authority: `training-session.commit.v1` through `NativeProductionContractService` / `Phase3CommandService` and `CanonicalPersistenceCommandPorts.commitTrainingSession` in the production Server SHA above.

GitHub was checked through `git fetch`/remote refs because the `gh` executable is not installed in this environment.

## Production read-only method and safety

The production database inspection was bounded to the configured canonical Founder owner and today's time window. It ran in:

`BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`

The session verified `transaction_read_only=on`; every query was a bounded `SELECT`; identifiers written below are one-way short hashes; no exercise names, set values, raw owner ID, raw workout ID, or raw record IDs are published. The transaction ended with an explicit rollback and emitted `PHYSIQUEOS_PR_AUDIT_READONLY_ROLLBACK_VERIFIED` before the connection was released.

Production logs and deployment metadata were also read-only. Today's workout was not re-confirmed, modified, deleted, duplicated, or used to create any new record.

## Today's sanitized acceptance case

- Observed completion request: `2026-10-01T16:29:00.917Z`.
- Canonical session creation/update: `2026-10-01T16:28:57.714Z`.
- Canonical session hash: `c736e5ee0409`.
- Native session/draft hash: `2a03bbc0a8c4`.
- Workout shape: four exercises, four completed sets per exercise.
- Exact command receipts: one `training-session.commit.v1` receipt, hash `4fc108160820`, status committed.
- Exact performance events created by that transaction: two.

The two events:

| Sanitized event | Sanitized exercise | Family | Canonical comparison |
|---|---|---|---|
| `aed0ad815f0b` | `7e1e3583c689` | `session_volume_pr` | current value greater than prior baseline; positive improvement |
| `22b636b33585` | `566fad9a5ab1` | `session_volume_pr` | current value greater than prior baseline; positive improvement |

All four exercise contexts had prior comparable history. The authoritative durable result contains two session-volume records and zero reps-at-load records; therefore no other current supported record family was newly established. Load-only highs are intentionally outside the two durable/presented record families and cannot explain a missing celebration.

Both event rows have `schema_version=training_performance_event_v1`, category `training_performance`, the exact canonical session source, and the same transaction timestamp as the canonical workout. This proves canonical persistence, not merely transient detection.

## Canonical computation through durable confirmation

The exact current path is:

1. Native submits `training-session.commit.v1` with stable draft/session identity and idempotency key.
2. Server commits the canonical authoritative training session.
3. Within the same command transaction, `CanonicalPersistenceCommandPorts` calls `reconcileCommittedSessionPerformanceEvents`.
4. The producer compares the just-committed exercise contexts against strictly prior comparable canonical history and emits only supported improvements.
5. Canonical performance event persistence stores the new `training_performance_event_v1` rows. A producer/collision deferral is represented honestly as deferred; a persistence failure fails the transaction rather than acknowledging a false durable success.
6. `sessionPerformanceRecordsResult` projects the persisted events into the success model.
7. The command returns `status: "durable"`, `trainingSessionDurable: true`, the canonical session identity, and `performanceRecords: { status: "completed", records: [...] }`.
8. The full result is stored in the command receipt. An idempotent replay returns the stored result rather than recomputing or duplicating records.
9. The exact-session training read separately projects the same canonical events, providing Native's safe recovery/read-back path.

For today's receipt:

- `status` is `durable`.
- `trainingSessionDurable` is `true`.
- canonical session identity matches the persisted workout.
- `performanceRecords.status` is `completed`.
- `performanceRecords.records` contains exactly two records.
- both projected records are `session_volume_pr` and reference the two persisted source events.
- all Native-required fields have compatible types: record ID, exercise ID/name, achievement type/title/value, workout date, numeric achieved value, and optional formatted baseline/improvement strings.
- optional nested values may be absent and an extra Server ordering field is safely ignored by Native.

Production logs corroborate the database receipt:

- `native.command.receipt_committed` at `2026-10-01T16:29:01.916Z`.
- command `training-session.commit.v1`, status committed, duration 4203.24 ms, durable true.
- durable acknowledgement at the same instant; confirmation duration 0 ms because the receipt was already final.
- recorded stages: validation 72.14 ms, canonical commit 3759.10 ms, durable read-back 0.06 ms.
- one training command only; no retry, processing replay, or pending-result poll.
- immediate subsequent navigation reads: Training Logger (720 ms) and Home (948 ms).

`accepted_processing` is a Native ambiguity/recovery state, not the mechanism that computes today's PRs. If used, Native polls exact durability and performs the exact-session read; PR production is still synchronous with canonical commit. Today's command did not take that path.

## Native receipt, decode, state, and presentation trace

Accepted Build 75 source behavior before the patch:

- `TrainingWriteAPI.TrainingCommitResult` includes optional `performanceRecords`.
- A directly committed durable command decodes the receipt result, including records.
- The compatibility durable-readback constructor itself can omit `performanceRecords`, but `TrainingLoggerViewModel` then performs the exact-session read and applies its authoritative record list.
- Accepted-processing/result-unknown recovery uses exact draft durability proof and the same exact-session read. It does not resubmit a durable workout.
- Record decoding is intentionally lossy per item so an unknown/malformed future record cannot invalidate an otherwise durable workout. Today's two records contain every required compatible field, so neither would be dropped.
- `TrainingLoggerViewModel.loadCompletedPerformanceRecords` applies an authoritative commit result synchronously and otherwise launches the exact-session read.
- The records were held only in `completedPerformanceRecords` on that view-model instance.
- Immediately after success, `completeLocalCapture` deleted the draft from `TrainingLoggerDraftStore`.
- Navigation/view-model recreation therefore had no completed session identity to reload and no durable “presentation still owed” marker.
- `NewPerformanceRecordsCard` existed only when the in-memory list was nonempty. Its `onAppear` invoked `WorkoutCelebrationGate.claim`.
- `claim` wrote the per-session `UserDefaults` key before any check that the containing Training Logger tab was actually visible. Reduce Motion intentionally consumes the key while suppressing animation, but would still leave the record card visible; it does not explain the missing record details reported here.

The sanitized real receipt projection was exercised through the existing lossy decoder test and decodes as one authoritative result with valid records. Therefore the failure boundary is after decode/application, at state retention/navigation/presentation.

## Root-cause proof and classification

The upstream hypotheses are closed by direct evidence:

- **PR computation defect — rejected:** two supported improvements were computed from prior comparable history.
- **Canonical persistence defect — rejected:** two canonical event rows exist in the same transaction as the session.
- **Server response omission — rejected:** the one durable receipt contains both projected records.
- **Accepted-processing timing — rejected for today:** the one command was durably committed; no processing/replay path occurred.
- **Native decode defect — rejected:** today's exact field/type shape is accepted by the Build 75 decoder and the sanitized projection test.
- **Retry/idempotency defect — rejected:** no retry occurred; stored-receipt replay is deterministic in Server tests.
- **Confetti-only rendering defect — insufficient:** it would not explain loss of the record card/details.

The remaining failure is reproduced by the pre-patch Native lifecycle contract: a result arriving while the retained tab hierarchy is hidden can trigger `onAppear` and consume the one-shot; navigating back cannot reconstruct the records because the exact local draft was deleted. The production trace's immediate Home navigation supplies the same timing condition. A post-patch deterministic test proves that hidden presentation can no longer claim the key, and another proves that view-model recreation reloads the same authoritative records from a persisted pending completion.

The audit cannot recover a historical phone framebuffer or assert the precise SwiftUI callback nanosecond. It does prove every data boundary through Native decode and identifies one concrete, deterministic lifecycle path that both matches the production navigation timing and fully explains loss of **both** the card and confetti. No other earlier boundary is compatible with the persisted receipt and schema evidence.

Classification:

- Native state ownership defect: **yes**
- navigation/view-lifecycle defect: **yes**
- dedupe/one-shot defect: **yes**
- async timing/lifecycle defect: **yes, at presentation state arrival/visibility**
- PR computation, canonical persistence, Server omission, Native decode: **no**

## Candidate patch

Branch `codex/workout-pr-celebration-lifecycle-fix-20261001`, SHA `69cad804e2ac7d74ed98914e1601f2e7863dadc3`:

- Adds optional `completionPresentationPending` to the local draft contract. Missing remains the safe legacy value, so old/historical completions do not replay.
- On direct durable success and exact accepted-processing recovery, persists the exact completed draft with this marker instead of deleting it immediately.
- On reload, restores only explicitly marked pending completions and re-reads the authoritative exact-session records.
- Preserves the prior cleanup behavior for unmarked legacy residues, even when their exact canonical durability can be proven.
- On entering Log at its root, routes to an unacknowledged pending completion before ordinary active-session routing.
- Adds an explicit visibility input to `WorkoutCelebrationGate`; a hidden surface neither animates nor consumes the one-shot.
- Retries the claim when Workout Complete becomes visible.
- Clears the completed local marker, records, and draft only at the explicit **Return to Log** acknowledgement boundary.
- Keeps the existing per-session one-shot key and Reduce Motion behavior.

No Server files, schemas, canonical records, workout logic, TrainingSessionAuthority code, Live Activity mockup code, or Sleep code were changed.

## Verification

Final candidate-specific deterministic run:

```text
xcodebuild test -project ios/PhysiqueOS.xcodeproj -scheme PhysiqueOS \
  -destination id=A8157897-95ED-4480-9150-6136652A6519 \
  -derivedDataPath /private/tmp/physiqueos-pr-celebration-derived \
  -only-testing:...seven focused lifecycle/decoder/routing tests

Executed 7 tests, 0 failures — TEST SUCCEEDED
```

The seven final-SHA tests cover:

- durable submission persists only a pending completion;
- accepted-processing becomes durable without a second commit;
- pending completion survives view-model/process-style recreation and reloads records;
- explicit acknowledgement is the only cleanup boundary;
- a hidden presentation cannot consume the celebration;
- the real Server-shaped record result decodes lossily without breaking durable success;
- only an explicitly marked completion routes back to Workout Complete.

Broader focused run on the same implementation immediately before a test-method-name-only cleanup:

- `TrainingLoggerTests` + `AppTabTests`, with the unrelated stale build-number assertion skipped: **89 tests, 0 failures**.
- This covered one PR, multiple PRs, no PR, direct authoritative result, exact-session fallback, accepted-processing recovery, no second commit, retry/dedupe behavior, multiple records per exercise, unknown/bad record fail-soft decoding, Reduce Motion, active-workout routing, and legacy no-replay behavior.

An initial run before updating old “successful commit deletes draft immediately” expectations executed 90 tests and failed 16 behavior assertions plus one unrelated build-number assertion; the newly added lifecycle tests already passed. After updating those expectations and retaining legacy cleanup, the bounded suite passed as above.

Not run:

- full repository test suite;
- physical-device UI acceptance;
- automated foreground/background UI test (the stronger view-model recreation/relaunch contract is covered deterministically);
- visual confetti screenshot/golden test;
- archive, App Store validation, or TestFlight upload;
- Server tests on the Native-only patch (Server source was not changed).

The skipped pre-existing assertion expects Build 74 in source-controlled settings even though the accepted source is Build 75. It is unrelated to this branch and was not modified.

## Acceptance and release recommendation

Do **not** re-confirm or edit today's workout. Its two performance records are already correct and durable.

Today's missed celebration will not be replayed by this patch: the currently shipped build already discarded its local pending identity, and the fix intentionally does not infer presentation debt from historical Server sessions. That avoids surprising historical celebrations.

After code review and a separately authorized TestFlight release, the Founder needs a **future natural workout that genuinely creates at least one supported canonical PR** to verify the complete on-device visual path. Acceptance should include switching to Home during/just after confirmation, returning to Log, seeing the record details, seeing confetti once when Reduce Motion is off, and confirming it does not replay after **Return to Log** or relaunch.

Safe next step: review/merge `69cad804e2ac7d74ed98914e1601f2e7863dadc3`, then separately authorize a Native build/TestFlight cycle and natural-workout acceptance. No TestFlight action is authorized by this audit.

## Isolation and residual state

- Original Live Activity worktree was not edited.
- TrainingSessionAuthority, Live Activity mockup, and Sleep workstreams were not modified or rebased.
- Production inspection artifacts containing raw identifiers remained transient/local and were not committed.
- No private Founder workout values or raw identifiers are in this report or code branch.
- Native fix branch is clean after the pushed commit.
- No production or TestFlight rollback is required because neither was changed.
