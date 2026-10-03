# Build 82 live workout finish stall — FINAL audit (read-only)

- Task: `agent-handoffs/inbox/prompts/20261002T235500Z-build82-live-workout-finish-stall-audit.md` (task authority: main e4cf6783)
- Checkpoint 1: `agent-handoffs/reports/20261003T000935Z-build82-live-workout-finish-stall-audit-checkpoint1.md` (main 024aea62)
- Agent: Claude, read-only incident lane
- Status: **complete (audit only)**. No fix is implemented. The patch plan below awaits Founder authorization.

## 0. Bottom line

1. **The workout is safe, exactly once.** Server committed `training-session.commit.v1` durably at **00:07:54Z (17:07:54 PDT)**:
   - one receipt, one canonical Training session, one evidence package;
   - 3 exercises with 4 + 4 + 5 = **13 sets**, matching the phone's Final Confirmation;
   - no Evidence Review and no accepted_processing.

   It was still the only Training commit at the last snapshot, 00:18:57Z.
2. **The two Finish attempts were not one operation.**
   - **Watch:** Finish never got past *finish-confirmation requested*. Build 82 shows that state as "Finishing safely…", and the actual **Finish** confirm button exists only on the swipe-left controls page. Proof: no Watch finish operation reached the phone's finish coordinator, and the committed finish time is the phone's.
   - **Phone:** its Finish was an independent commit. The phone could not deliver any command for ~9 minutes. Each attempt waited out the dedicated command URLSession's 60 s connectivity wait while ordinary reads kept working. Once delivery resumed, the first attempt committed in 6.75 s.
3. **Server was never the blocker.** It had no pending request, no rejection, no duplicate and no HealthKit gate.
4. **HealthKit leg:** tonight's Watch HealthKit workout was never ended or saved, because confirm never ran. Build 82 has **no path** that can still save it. It will be discarded when the Watch next receives a terminal projection. Structured data is unaffected.
5. **Rest Stopwatch:** the requested-finish state keeps `rest` in the projection, and the Watch execution view renders rest in every non-paused phase, including `.finishing`.

## A. Authority (reverified)

- Production Server: `d0ff65965233fa44e108387f01b649a2bdb476df`, deployment `64533990` ACTIVE.
  - Web and worker run the same SHA.
  - `PHYSIQUEOS_GIT_SHA` was confirmed in the runtime by each probe.
  - No deployment is in progress. No Server source has changed since (`d0ff6596` is the newest `src` commit on any ref).
- Native: Build 82 = `e2cbcd0cf40dca64a4c8490bf0ebd4077b2eb69c` (TestFlight f3d09d99). **No `ios/` commit exists after it on any ref.**
- Contracts:
  - Watch workout wire contract `schemaVersion 2`;
  - HealthKit strength matcher `healthkit-strength-matcher-v5`;
  - workout canonical activation policy v4 (`linkAutoConfirm=false`);
  - commit receipt result schema as captured below.

## B. Live production capture (read-only)

Three snapshots, S1–S3, in production's own Node runtime via the approved `physiqueos-final-cutover-config` context and the portable runner (restored byte-exact from `4025f175`). Each one:
- gated on SHA and owner `user_founder_001`;
- ran `REPEATABLE READ READ ONLY` with `transaction_read_only = on` verified;
- issued 52 guarded SELECTs and ended with an explicit `ROLLBACK`;
- emitted its success marker exactly once.

S1's local wrapper exited 1 only because of the known `FORCE_COLOR`/`NO_COLOR` stderr warning; its remote payload completed. S2 and S3 were fully clean.

| | S1 00:07:26Z | S2 00:08:53Z | S3 00:18:57Z |
|---|---|---|---|
| `training-session.commit.v1` receipts (12 h) | **0** | **1** (committed, durable) | **1** (same) |
| Training canonical object for session `866DFA6E…` | none | v1 | v1 (unchanged) |
| Evidence package `training_logger_submission_866DFA6E…` | none | 1 | 1 |
| Evidence Reviews / accepted_processing | none | none (`reviewId: null`) | none |
| HealthKit workout for this session | none | none | none |
| Pending receipts (any age) / unprocessed outbox | 0 / 0 | 0 / 0 | 0 / 0 |
| runtime revision | 5206 | 5209 | 5213 (HealthKit activity ingests only) |

Committed session (sanitized):
- Server-side "session id" = Native draft id `866DFA6E…`. canonical id `training|authoritative|training_logger_draft_866DFA6E…`.
- Idempotency key `132ACD3D…` (Native UUID, persisted per draft and signature).
- start 22:55:12Z; **finish 23:58:45Z, which is the phone's `markFinishing` stamp**; duration 3,813 s; logger_mode `live`.
- Exercise count 3; set counts 4 / 4 / 5 = 13.
- Disposition `detailed_training_session_without_apple_link`. Package limitation: "No Apple workout was linked".
- Server stages: validation/package 134 ms, **bounded canonical commit 6,115 ms**, durable readback 0.4 ms, total 6,751 ms.
- `performanceRecords.status=completed`, 0 records. `trainingPerformanceEvents` stayed at 150 (see §L follow-up).

Not persisted on Server, by design: the draft/lifecycle/revision, `finishOperationId`, Watch Health/Server leg states and Live Activity state. These live only in Native (`UserDefaultsTrainingLoggerDraftStore`) and were not readable remotely. No Server table holds Watch commands.

## C. Server log correlation (web run logs, read-only)

Server logs `native.command.receipt_committed`/`durable_acknowledgement` on success and `api.request.failed` on any 4xx/5xx. Provider reads log on completion. There is no per-request access log, so a command that never arrives leaves no trace. The table (S1) is the authority for "nothing arrived".

Timeline (UTC; PDT = UTC−7):
- **22:54:52** Logger opened; workout start stamped 22:55:12.
- **22:55–23:51:59**: HealthKit ingest commands committed every 2–12 min; token refreshes OK. Command and read paths were both healthy during the workout.
- **23:51:59**: last command delivered before the stall.
- **23:52 → 23:59:45**: no command and no failure. **No `training-session` read either.** The Watch-finish coordinator issues that read first, before it commits, so this proves the coordinator never started.
- **23:58:45**: phone Finish confirmed (`finishedAt`).
- **23:59:46 / 00:00:48.2 / 00:00:48.5 / 00:00:48.8 / 00:00:51.1 / 00:01:52 / 00:02:54.3 / 00:02:54.6 / 00:02:56.8**: `training-session` reads → **404** (session not yet durable). These are the phone's readbacks after each failed commit attempt, plus durability-recovery probes.
  - The spacing matches Build 82 code exactly: each `submitCommand` attempt failed ~61 s after it started. That equals the command session's 60 s `timeoutIntervalForResource` with `waitsForConnectivity = true` (§D-3).
  - The 2.3 s gaps are the 2 s recovery delay.
- **00:02:57 → 00:07:44**: silence (~4m47s) with no HealthKit ingests either. This is consistent with the app being suspended (phone locked) mid-attempt.
- **00:07:44.8 / 44.99 / 47.77**: 404 readbacks and a recovery probe. **00:07:45.8**: a HealthKit ingest command goes through the same command transport. So the transport was working again.
- **00:07:47.865**: commit receipt transaction starts. **00:07:54.581**: `receipt_committed` (durable) and `durable_acknowledgement` (`finalOutcome: durable`).
- **00:07:56 / 00:08:01 / 00:08:02**: Log read-model refreshes, the cache invalidation that runs only after the client decodes a successful command outcome.
- No further `training-session` reads through 00:13:19, and no durability-recovery loop. **The phone received the durable result.**

Classification (§C list):
- **(1)** no commit reached Server for 23:58:45–00:07:47 (~9 min);
- then **(3)-negative**: Server committed **and** Native observed the acknowledgement.
- Excluded: (2) pending, (4) rejected, (5) idempotency collision, (6) HealthKit leg blocking Server.

## D. Native finish saga (exact Build 82 source)

### D-1. Watch Finish (the Watch leg never completed)

Path: Watch UI → `WatchWorkoutStore.issue` → `WCSession.sendMessageData` → `PhoneWatchWorkoutConnectivityBridge.route` → `WatchWorkoutCommandRouter.route` → `TrainingSessionAuthority` → reply → `synchronizeHealthKit`.

- Final-set primary button: `WatchWorkoutViews.swift` `primaryAction` shows **"Finish Workout" → `store.requestFinish()`**. That sends `.requestFinish` only.
- Phone `requestFinishConfirmation` sets only `finishConfirmationRequestedAt`. It does **not** set `finishedAt` or `watchFinishOperationId`, and does **not** clear `rest`.
- `WatchWorkoutProjectionMapper.swift:20` maps `finishConfirmationRequestedAt != nil` → **`phase = .finishing`**. That is the same phase as a confirmed, in-flight finish.
- `WatchWorkoutExecutionView.primaryAction` renders **"Finishing safely…" plus a spinner** for `.finishing`. The confirmation ("Finish this workout? Not Yet / **Finish**") is rendered **only** in `WatchWorkoutControlsView`, which needs a swipe to open.
- Only **Finish** there calls `confirmFinish()`. That stamps `finishedAt` and the `finishOperationId` and clears `rest`. Its acknowledgement triggers `health.finish()` (`workoutSession.end()` + `builder.endCollection` + `finishWorkout`) and then `reportHealthSaved`.

**Evidence that confirm never applied on the phone:**
- `WatchWorkoutFinishCoordinator.reconcile` runs only for drafts with `watchFinishOperationId`. Its first step is `isDraftAlreadyDurable`, a `training-session` read, and no such read exists between 23:16 and 23:59:46.
- The committed `finishedAt` (23:58:45) is the phone's later `markFinishing` stamp. It is set once (`if finishedAt == nil`), so a Watch confirm would have stamped it earlier.

The Watch therefore sat in the requested-confirmation state, labelled as finishing, with no timeout and no visible way forward. The most likely trigger is the final-set primary button. A confirm that was sent but lost or rejected cannot be excluded without Watch-side logs. Either way, the result is the same and so is the fix.

### D-2. Phone Finish (an independent operation)

Path: Logger → Finish Workout → Final Confirmation → `TrainingLoggerViewModel.submit()`:
1. `markFinishing` stamps `finishedAt` once and sets `rest = nil`.
2. `beginSubmission` is an in-memory lock.
3. The button shows `isSubmitting` → **"Saving…"**.
4. `ProductionTrainingWriteAPI.commit(draft)` → `submitDurableTrainingCommand`.

- The phone path never calls `confirmFinish` and never sets `watchFinishOperationId`. **The phone and Watch Finish paths do not share a `finishOperationId`, and the phone path never tells the Watch to end or save HealthKit.**
- What they **do** share prevents duplicates:
  - the same draft id, so a deterministic canonical id;
  - the same idempotency scope `training-session.<draftId>` and signature (draft, date, start, the persisted `finishedAt`, exercises and sets), so the same persisted key;
  - the same in-memory `beginSubmission` lock.
- After `result_unknown`, the button reads **"Finishing workout…"**. `scheduleDurabilityRecovery` then runs 30 attempts × 2 s; from attempt 1 on, each attempt re-commits with the same key.

### D-3. Why the phone could not deliver the commit (narrowed root cause)

- Commands use a dedicated `CommandNetworkDiagnosticsTransport.production()` session: `URLSessionConfiguration.default`, **`waitsForConnectivity = true`, `timeoutIntervalForResource = 60`**.
- Reads use the shared transport, without `waitsForConnectivity`.
- Per-attempt `URLRequest.timeoutInterval` is 3 s, then 1 s. That bounds idle time once connected, **not** the connectivity wait.
- Observed: commands failed at ~61 s (the resource ceiling) while reads to the same host succeeded in 60–160 ms. HealthKit ingests (same transport) also stopped from 23:51:59 to 00:07:45.
- **Narrowed hypothesis:** the command session's own path or pooled connection was stuck "waiting for connectivity" after a network change, possibly from leaving gym Wi-Fi, while the read session reconnected normally. Each attempt then burned the full 60 s.
- Why it is not proven: the decisive evidence is on-device in `CommandNetworkDiagnostics` (64-event ring of every command attempt: interface, path status, connect/TLS timings, reuse) and `NetworkFailureDiagnostics` (64-event ring of failure domain/code). **Neither has any UI or export in Build 82**, and the command ring rolls over within hours of HealthKit ingests. This is captured as patch P6.
- Contributing factor, even on a healthy network: Server's bounded canonical commit took **6.1 s** against the client's **3 s / 1 s** attempt budgets. Interactive commits will routinely fall into "ambiguous → readback → recovery". This time the client evidently still received the result, since there was no readback after 00:07:47.

### D-4. Live Activity / acknowledgement

- `endCommittedSession(retainingPresentation: true)` ends the Live Activity at commit and keeps a pending completion. The Watch's projection then becomes `.committed`, showing "WORKOUT SAVED".
- `acknowledgeCompletion` ("Return to Log") publishes **no** session change. The Watch therefore learns the session is gone only at its next own refresh (WCSession activation or reachability change), or when the pending completion expires (12 h).

## E. HealthKit leg

- Did the Watch `HKWorkoutSession` end, or the builder finish? **No.** `health.finish()` runs only after a confirmFinish acknowledgement or a "Retry Health Save" with `projection.finish.operationId`, and that operation id is nil here.
- No HealthKit workout reached ingestion (S1–S3: `healthKitCanonicalWorkouts` unchanged at 23; post-commit ingests are all `activity_summary`). No exact correlation is pending: there is no `finishOperationId`, so nothing to correlate.
- Structured commit was **not** waiting on HealthKit. The phone path has no HealthKit gate, and the Watch coordinator would commit independently of the Health leg.
- What will happen: the Watch's next terminal projection (`.unavailable` once the phone's pending completion is acknowledged or expires, or `.cancelled`) runs `health.cancel()`, which ends the session and `discardWorkout()`. **Tonight's Apple Health workout record cannot be saved by Build 82 by any path.** Whether builder-collected samples survive the discard depends on the platform and is unverified. Structured Training is unaffected.
- Indefinite-block risk: `health.finish()` has no timeout, and the Watch never times out "Finishing safely…".

## F. Performed-data safety (proven)

- **All 13 completed sets are durable on Server** in one canonical session: 4 + 4 + 5, 3 exercises. They no longer depend on either device.
- **No duplicate canonical workout:** one receipt, one canonical object (v1, unchanged S2 → S3), one package.
- **Another Finish cannot duplicate:**
  - The same draft yields the same signature (`finishedAt` is persisted once) and therefore the same persisted idempotency key, so Server replays the original receipt.
  - Even a different key upserts the same deterministic record ids (`training|authoritative|training_logger_draft_<id>`, `training_logger_submission_<id>`), not a sibling.
  - In practice the phone already ended the draft (`endCommittedSession`), so no Finish control remains for it.
- **Force-quit loses nothing:** Server owns the workout. On relaunch, `load()` re-proves durability (`isDraftAlreadyDurable`) and only re-presents completion.
- **Save & Leave:** not applicable after commit, and harmless (local only).
- **Cancel:**
  - Phone Cancel is unavailable after commit.
  - Watch "Cancel Workout" would be refused by the router (`sessionUnavailable` → terminal) and only discard the Watch HealthKit session. **It cannot touch Server data.** Its copy ("Completed sets will not be saved") is misleading in this state; avoid it.

## G. Rest Stopwatch kept ticking

- `requestFinishConfirmation` does not clear `draft.rest`, so the published projection still carries `rest`.
- `WatchWorkoutExecutionView.rest(at:)` renders a live stopwatch in every phase except `.paused`, including `.finishing`. Only the countdown haptics are phase-gated (`scheduleCountdownHaptics` requires `.active`).
- The stopwatch therefore kept counting under "Finishing safely…" until a projection without `rest` arrived (after the phone's `markFinishing`/commit).
- Invariant breach: when the user enters any finish state (requested or confirmed), the Watch must freeze and hide rest and stop haptics locally at once, without waiting for the phone.

## H. Timing and missing recovery UI (from code)

| Leg | Budget in Build 82 | Gap |
|---|---|---|
| Watch command (`sendMessageData`) | none; errorHandler only sets `.reconnecting`; retry only on a reachability-change callback | no timeout, no backoff retry, "Finishing safely…" unbounded |
| Watch HealthKit finish | none | unbounded await |
| Phone coordinator (Watch finish) | 3 attempts, 2 s apart; re-triggered on any change | fine, but needs `finishOperationId` |
| Phone commit attempt | request-idle 3 s, then 1 s; **connectivity wait up to 60 s each**; 0.5 s replay delay; 3 readbacks | up to ~2 min of "Saving…" per `commit()` call |
| Phone durability recovery | 30 × (2 s + up to ~2 min) | up to ~60 min of "Finishing workout…" with no Retry/escalation UI |
| Server training commit | bounded canonical commit observed 6.1 s | exceeds the client's 3 s / 1 s budgets |

## I. Founder recovery action (single, safe)

**On the iPhone, open PhysiqueOS and tap "Return to Log" on the Workout Complete screen.**

- Why it is safe: it clears only the local completion presentation. Server already holds the workout exactly once, and no command is sent.
- Then leave the Watch alone. The next time the PhysiqueOS Watch app refreshes (it does so on its own when it reconnects; opening the app also triggers it), it receives the terminal state and ends its HealthKit workout. Tonight's Apple Health workout record will **not** be saved, a known Build 82 limitation (§E).
- If the phone is not showing Workout Complete (still "Saving…" or "Finishing workout…"), force-quit and reopen PhysiqueOS first. Relaunch re-proves the durable commit and shows Workout Complete without creating anything.
- Do not use Watch "Cancel Workout" or Watch "Finish". Neither can harm Server data, but neither saves anything, and Cancel's copy is misleading.
- No production mutation or manual repair is needed or requested.

## J. Patch plan (not implemented; awaiting authorization)

Native (Build 83 candidate) unless noted. Each item is minimal and has a deterministic test.

- **P1 — Watch finish state machine.**
  - Split the projection phase into `.finishConfirmation` (requested) and `.finishing` (confirmed, with `finish.operationId` set).
  - The execution view shows the inline confirm ("Finish" / "Not Yet") for `.finishConfirmation`, never "Finishing safely…".
  - The final-set primary button opens that confirmation.
- **P2 — One finish operation for both devices.**
  - Phone `submit()` for a draft with a paired Watch session mints or reuses a single `finishOperationId` via `confirmFinish(finishOperationId:)` instead of bare `markFinishing`. The Watch then receives `.finishing` with `finish.operationId` and runs `finishHealthKit(operationId)` (end and save HealthKit at `finishedAt`).
  - Exactly one commit owner, guarded by `beginSubmission`. The idempotency key is already shared.
  - The Watch also saves its HealthKit session if it receives `.committed` while its own session is still running.
- **P3 — Command transport.**
  - For interactive Training commits, bound the connectivity wait to the UI budget (~10–15 s resource timeout, or `waitsForConnectivity = false` with immediate failure).
  - Recreate the command URLSession (`finishTasksAndInvalidate`) after a transport failure while reads to the same host succeed.
  - Surface `taskIsWaitingForConnectivity` as "Waiting for network".
- **P4 — Client/Server budget.**
  - Give the Training commit attempt ≥ 15 s (Server is bounded), or bring the canonical commit under 3 s. The latter is a separate Server performance item: `reconcileCommittedSessionPerformanceEvents` loads the full `canonicalEvidenceObjects` and event collections inside the command transaction.
  - Keep the same-key replay.
- **P5 — Recoverable UI.**
  - Phone: after ~20 s, replace "Saving…" with "Still saving — your workout is safe on this iPhone" plus a same-key **Retry**, and never Cancel.
  - Watch: give "Finishing…" a ~30 s timeout → "Waiting for iPhone" plus Retry, and retry `sendMessageData` with backoff (not only on reachability change).
  - Both survive relaunch (persisted `submissionState`/operation id; already true on phone).
- **P6 — Observability.**
  - Native: a Founder diagnostics export for `CommandNetworkDiagnostics` and `NetworkFailureDiagnostics`, and longer retention of failure events.
  - Server (log-only, dormant-safe): a `native.command.received` line at request start (commandType, fingerprint), so "never reached Server" and "in flight" are provable from logs.
- **P7 — Terminal rest.**
  - The Watch clears rest and haptics locally on `requestFinish`/`confirmFinish`/any non-active phase.
  - The authority clears `rest` on `requestFinishConfirmation`, or the mapper suppresses `rest` unless phase is `.active` or `.paused`.
  - The Live Activity mirrors the same rule.
- **P8 — Acknowledgement publish.** `acknowledgeCompletion` publishes a session change, so the Watch receives the terminal state immediately rather than on its next refresh.

## K. Deterministic reproduction tests (to write with the fix)

Use fakes for WCSession, HealthKit (`HKWorkoutSession`/builder) and `FounderHTTPTransport` with a controllable clock and injectable connectivity wait.

1. **Today's exact sequence:** Watch final-set "Finish Workout" → `requestFinish` applied → Watch shows `.finishConfirmation` (P1), not `.finishing`; no 3-minute dead state.
2. Watch confirm → phone `confirmFinish(op)` → coordinator commit; HealthKit finish delayed 120 s → Server commit still durable; Watch shows Health pending; no duplicate.
3. Server commit delayed 6.75 s against the 3 s budget → readback/replay with the **same key** → exactly one receipt and one canonical object.
4. Command transport in a connectivity wait for 9 min while reads succeed → bounded failure ≤ budget, "Waiting for network" shown, session recreated, success on the next attempt; one receipt.
5. Lost Watch acknowledgement (reply dropped) → idempotent resend of the same `mutationId` → `.unchanged`; Health finish runs once.
6. Lost phone acknowledgement (Server committed, response dropped) → `isDraftAlreadyDurable` resolves with no second commit.
7. **Phone Finish while Watch finish is requested or in flight** → one `finishOperationId`, one commit owner (`beginSubmission`), the Watch receives the operation and saves HealthKit; no duplicate evidence.
8. App relaunch during each stage (Saving, Finishing workout…, pending completion) → recovery re-proves durability; never re-creates; the completion is presented once.
9. Duplicate Finish (double tap, phone + Watch) → the same idempotency key; the Server receipt replays.
10. 13-set fixture (4/4/5) round trip → the canonical object has exactly 13 sets; performed-only projection unchanged.
11. Rest Stopwatch running → `requestFinish` → the Watch rest view is gone and haptics are cancelled within one frame, without a phone reply.
12. "Return to Log" → the Watch receives a terminal projection immediately (P8) → HealthKit session ended exactly once.

## L. Other findings (kept separate from this incident fix)

- A consolidated post-workout Native patch is recorded and still pending, separate from P1–P8:
  - fixed, non-scrollable Watch execution layout;
  - green progress bar;
  - metrics order and colors;
  - third Daily Totals page;
  - intermittent, likely user-error Add Set audit.
- **Follow-up (separate):** this commit derived **0** `trainingPerformanceEvents` (collection unchanged at 150, receipt `performanceRecords.status=completed`, 0 records, no deferred work items). Confirm whether that is expected for this session or a derivation gap affecting history and PRs. It needs a bounded read-only probe of the event-derivation inputs. It is not a finish-stall cause.
- The Server bounded canonical commit at 6.1 s is a performance item in its own right (see P4).

## No-mutation ledger

- Production writes: **0**. Three READ ONLY transactions (S1–S3), all rolled back; record-store and command access was SELECT-only.
- Control plane: read-only `doctl apps get`/`apps logs` via `physiqueos-final-cutover-config`. No deploy context was used.
- Workout/WCSession commands sent: 0. HealthKit touched: no. Deploys: 0. Native builds: 0. TestFlight: no change.
- The Founder was not asked to interact before data safety was proven. One push notification was sent after checkpoint 1, saying the data was safe and asking them not to act yet.
- Local only and not pushed:
  - the restored runner (`.tmp/ro`, git-ignored, with a symlinked `node_modules`);
  - the probe sources and raw sanitized JSON;
  - the web-log tails and the source worktrees (`d0ff6596`, `e2cbcd0c`) in the job scratch directory.

  The raw JSON contains set-level loads and reps, which this report intentionally omits.
