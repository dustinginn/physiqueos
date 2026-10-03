# Build 82 live workout finish stall — CHECKPOINT 1 (live production capture)

- Task: `agent-handoffs/inbox/prompts/20261002T235500Z-build82-live-workout-finish-stall-audit.md` (task authority: main e4cf6783)
- Agent: Claude, read-only incident lane
- Status: **checkpoint — audit continuing** (Native saga root cause, Stopwatch, patch/test plan still to come in the final report)
- Production authority, reverified via the read-only control plane: Server `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990` ACTIVE. Web and worker are on the same SHA. No deployment is in progress.
- Native: Build 82 `e2cbcd0c` (TestFlight f3d09d99), per the Build 82 report. Exact source tracing is still pending.

## Headline

**The workout is safe and was committed exactly once, but late.**

- Server accepted `training-session.commit.v1` at **2026-10-03T00:07:47.865Z** and committed it durably at **00:07:54.581Z** (17:07:54 PDT).
- That is about **9 minutes** after the Final Confirmation finish time recorded in the evidence (end_time 23:58:45Z), and about 12 minutes after the Watch Finish.
- The canonical Training session holds **3 exercises with 4 + 4 + 5 = 13 sets**, matching the phone's Final Confirmation.
- Before 00:07:47Z, no Training command of any kind had reached Server in the prior 12 h. The first snapshot, taken at 00:07:26Z, proves this.

**So the blocked leg was Native-side, before the network:** the commit was not sent for about 9 minutes after Finish was confirmed. Server was not slow, did not reject the commit, and had no pending request. Server work took 6.75 s:
- 134 ms validation/package;
- 6,115 ms bounded canonical commit;
- 0.4 ms durable readback.

## Live snapshots (read-only, sanitized)

Path: approved least-privilege context `physiqueos-final-cutover-config` plus the portable runner, restored byte-exact from `4025f175` (blob `f7123347`, ignored and local only). Each payload:
- gated on runtime `PHYSIQUEOS_GIT_SHA == d0ff6596…` and owner `user_founder_001` before any DB access;
- ran `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` and verified `transaction_read_only = on` (observed `on` both times);
- used a SELECT-only guard (52 SELECTs each);
- ended with an explicit `ROLLBACK` and emitted its success marker exactly once.

| Snapshot | DB time (UTC) | Training commit receipts (12 h) | Training canonical objects | runtime revision |
|---|---|---|---|---|
| S1 (marker …20261002A) | 00:07:26 | **0** | none for today | 5206 (last write 23:51:59, a HealthKit activity ingest) |
| S2 (marker …20261002B) | 00:08:53 | **1** (`training-session.commit.v1`, status `committed`) | **1** | 5209 |

S1's runner exited non-zero only because a local `NO_COLOR`/`FORCE_COLOR` warning reached stderr (known gotcha). The remote payload completed, rolled back, and emitted its marker exactly once. S2 ran with `FORCE_COLOR` unset and was fully clean: exit 0, empty stderr, marker ×1.

### S1 (before the commit landed), 00:07:26Z

- `command_receipts`, 12 h: 70 rows, all HealthKit ingests plus one coaching save and one check-in. **No `training-session.*` and no `training-logger.*` rows.** Pending receipts of any age: 0.
- `trainingPerformanceEvents` last updated 2026-10-01. Training `canonicalEvidenceObjects`, `evidencePackages`, `evidenceReviews`, `healthKitWorkoutLinks` and `healthKitWorkoutLinkClaims`: no change today.
- `healthKitCanonicalWorkouts`: one record today, 16:40–17:18Z, from the **dev** bundle on the Watch. That is the earlier Watch Cancel-parity test workout. There is **no HealthKit workout for tonight's chest session**.
- `outbox_messages`: 0 recent, 0 unprocessed. `pg_stat_activity`: no in-flight application transaction, only the idle outbox poller. `operations`: 0 recent.

### S2 (after the commit), 00:08:53Z

- **Exactly one** `training-session.commit.v1` receipt:
  - idempotency key `132ACD3D…` (Native UUID); sessionId `866DFA6E…`; status `committed`; result `durable`, `trainingSessionDurable: true`;
  - `reviewId: null`, so there is no Evidence Review and no accepted_processing claim;
  - `continuationWorkItemIds: []`, `lowerLevelWorkItemIds: []`.
- **Exactly one** new canonical training evidence object, `training|authoritative|training_logger_draft_866DFA6E…`:
  - logger_mode `live`, start 22:55:12Z, end 23:58:45Z, duration 3,813 s;
  - 3 exercises, sets 4 / 4 / 5 = **13**;
  - reconciliation disposition `detailed_training_session_without_apple_link`.
- **Exactly one** new evidence package, `training_logger_submission_866DFA6E…`. Its quality limitation reads "No Apple workout was linked".
- Collection diffs S1 → S2:
  - only `canonicalEvidenceObjects` +1 and `evidencePackages` +1 (the commit);
  - `healthKitObservations` +2 and `healthKitCanonicalDays` activity revisions 57/58 (two routine activity-summary ingests at 00:07:45Z and 00:07:54Z);
  - nothing else.
- Still **no HealthKit workout observation** for this session: `healthKitCanonicalWorkouts` unchanged at 23, and both new ingests were `activity_summary`. `workoutRelationships.assessed=20`, candidate links 0.
- `trainingPerformanceEvents` is unchanged (150). The commit reported `performanceRecords.status=completed` with 0 records. Whether that is expected for this path is to be confirmed in the final report.

## Production log correlation (web run logs, read-only, since deployment start 20:07Z)

Server emits no per-request access log for commands. It logs `native.command.receipt_committed`/`durable_acknowledgement` on success, `api.request.failed` on 4xx/5xx, and provider read completions. The absence of a failure line therefore proves no rejected command. Combined with S1's receipt table, it also proves no accepted command.

- **22:54:52Z**: `core.navigation.training-logger` read. Start time recorded 22:55:12Z, so the workout started then.
- **23:16:10Z**: a single `training.navigation.session` read → 404 `RESOURCE_NOT_FOUND`, mid-workout.
- **Every 2–12 min, 22:54–00:07**: HealthKit activity ingests committed and access-token refresh cycles succeeded. The phone's network and auth were healthy throughout.
- **23:51:56–23:51:59Z**: refresh plus ingest OK. This is the last Server write before Finish.
- **No `api.request.failed` and no command line between 23:52Z and 23:59:45Z**, which covers the Watch Finish and the "Finishing safely…" window.
- **23:59:46Z → 00:07:47Z**: repeated `training.navigation.session` reads → **404**, 14 in total:
  - 23:59:46 ×1;
  - 00:00:48–51 ×4;
  - 00:01:52 ×1;
  - 00:02:54–56 ×3, around a routine token refresh;
  - 00:07:44–47 ×3.

  Native was reading a session resource that did not yet exist, while "Saving…" was showing.
- **00:07:47.865Z**: commit receipt inserted. **00:07:54.581Z**: `receipt_committed` (durable) plus `durable_acknowledgement`, `finalOutcome: durable`.
- Log tail ends at 00:07:56Z, so there is no later failure.

Server-side classification against task §C: **(1) no commit request reached Server for ~9 min after Finish, then (3-candidate) Server committed durably**. Whether Native observed the acknowledgement is unknown. The Founder's current screen state must be read before saying more (see "Founder" below). Every alternative is ruled out by S1, S2 and the logs:
- (2) pending: no receipt and no in-flight transaction;
- (4) rejected: no failure line;
- (5) duplicate: one receipt, one canonical object;
- (6) HealthKit leg blocked Server: no HealthKit workout ingested, and the commit succeeded without one.

## Data safety (§F), proven server-side

- All 13 completed sets are durably committed in one canonical session: 4 + 4 + 5, exercise count 3.
- No duplicate canonical workout: one receipt, one evidence object, one package.
- The canonical id is draft-derived (`training|authoritative|training_logger_draft_<sessionId>`). Whether a second Finish with a **new** idempotency key would replace the record or duplicate it is **being verified in source next**. **Until that is confirmed, do not tap Finish / Retry / Save & Leave / Cancel on either device.**

## Founder: do not act yet

There is no recovery action yet. The data is safe on Server. The final report will give exactly one action after the idempotency and relaunch proofs. Useful and harmless if convenient: **look, without tapping, at what each screen shows now.** Does the phone still say "Saving…"? Is the Watch still on "Finishing safely…"? Is the rest Stopwatch still running?

## No-mutation ledger

- Production writes: **0**. Two READ ONLY transactions, both rolled back. Control-plane reads only, via `physiqueos-final-cutover-config`. Log read via `doctl apps logs --type run`.
- Workout commands sent: 0. HealthKit touched: no. Deploys: 0. Native builds: 0.
- The Founder was not asked to interact.
- Local only and not pushed: the restored runner (`.tmp/ro`, ignored), probe sources, raw sanitized JSON and the web log tail in the job scratch directory. These contain set-level loads, which are intentionally not reproduced here.

## Next (audit continues)

1. Trace Native e2cbcd0c to explain the 9-minute pre-network stall and the periodic 404 session reads:
   - Watch Finish → WCSession → `WatchWorkoutCommandRouter` → TrainingSessionAuthority → HealthKit finish → commit queue → ack → Live Activity → Watch summary;
   - phone Finish → Final Confirmation → Saving.
2. Shared operation identity: finishOperationId vs. idempotency key; whether the phone's Finish created a second operation.
3. Server idempotency for a second commit of the same sessionId with a different key.
4. Rest Stopwatch terminal bug; timeouts and recovery UI; patch plan; deterministic reproduction tests.
