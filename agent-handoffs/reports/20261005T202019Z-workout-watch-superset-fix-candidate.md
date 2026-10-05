# Workout reliability lane — Build 87 Watch/superset fix candidate (checkpoint 2 of 2)

Task id: `workout-watch-superset-real-session-audit-20261005`
Lane: **Workout reliability lane**. Separate from Redesign Batch 3 and from the Batch 2 / Build 88 release gate.
Audit (checkpoint 1): `agent-handoffs/reports/20261005T195700Z-workout-watch-superset-real-session-audit.md` (main `be026418`).

## Candidate SHAs

| Item | SHA / branch |
|---|---|
| Native candidate | **`cd06bfea`** on `claude/build87-workout-reliability-audit-20261005` (base Build 87 `f66c7fc6`) — pushed |
| Server candidate (NOT deployed) | **`b5de242f`** on `claude/server-trusted-watch-uuid-case-20261005` (base production `c7c99347`) — pushed |
| Production Server | `c7c99347`, deployment `e7ef3157` (unchanged) |

There was no build bump, no TestFlight upload, no deploy, no merge into the Batch 2 RC, and no production writes.

## What changed (Native, on Build 87 `f66c7fc6`)

### Issue 3 — Watch-finished workout now hydrates the same phone recap

- **Persisted Server records.** The `TrainingLoggerDraft.watchAuthoritativePerformanceRecords` field is optional and Codable, so older drafts still decode. `WatchWorkoutFinishCoordinator.recordServerSuccess` now passes the Server's own record list to `TrainingSessionAuthority.recordWatchServerCommit`. It comes from the commit result when that result is `completed`, otherwise from the session read-back. The PR count is now derived from that list, so the Watch "N PRs" metric and the phone card can never disagree.
- **Recap source.** `TrainingLoggerViewModel.loadCompletedPerformanceRecords` uses, in order:
  1. the authoritative commit result;
  2. the persisted Watch-path Server records;
  3. a Server read.

  Native still never computes a PR.
- **"Unknown" vs "none".** `completedPerformanceRecordsDraftId` marks a list as known. `refreshCompletedPerformanceRecordsIfUnknown()` re-reads only while the list is unknown. It runs:
  - when Workout Complete appears;
  - when the scene becomes active;
  - when Log-tab routing resumes the same completion.

  A known empty list is never re-read.
- **Confetti is unchanged.** The existing `WorkoutCelebrationGate` key `physiqueos.workoutComplete.celebrated.<draftId>` still applies: one celebration per draft, Reduce Motion respected, only the phone celebrates, so nothing duplicates. The Watch-origin path now simply reaches the same card.

### Issue 2-A — superset context wiring (no semantics change)

- **History mapping.** `ProductionTrainingLoggerAPI.history(for:in:)` now decodes the session's `exerciseRelationshipGroups` and each exercise's `id`/`name`, and builds `TrainingLoggerHistoryRelationship` (partners in group order).
  - Pairing exercises now shows superset-context Previous history. For today's pair: Leg Extensions 80×15 and Sissy Squats 50×12, both from 09-14.
  - Standalone Previous no longer absorbs superset sessions. This matches the Server's PR and progression pools.
- **Partner removal.** `removeExercise(id:catalog:)` now returns the surviving superset partner to standalone context. All view call sites pass the catalog.
- **Catalog miss.** The early return now also clears the stale recommendation and choice.
- **Completed sets are immutable under guidance.** `applyProgressionSuggestion` and `keepPreviousPerformance` now fill only uncompleted sets. Previously they overwrote and un-completed every set.
- **Not changed:**
  - Suggested/Maintain is still withheld in superset context (existing design).
  - Set rows are not auto-refilled on pair/unpair. That needs Founder decisions 2-B and 2-C.

### Issue 1 — Watch Complete Set acknowledgement and instrumentation

- **(a) Context acknowledgement.** When the phone's application context names the pending Complete Set (`lastAcknowledgedMutationId == pending.mutationId`), that settles it immediately. Previously the button stayed disabled until the `sendMessage` reply or the 12 s watchdog. The late reply then settles nothing twice and re-sends nothing.
- **(b) Unsent taps.** A Complete Set tap that cannot be sent (phone unreachable at that instant, or another command in flight) no longer leaves "SET PENDING…". It traces `commandNotSent`.
- **(c) Correlatable latency logs.**
  - Watch `WatchLatency` lines now carry `kind=…`, `m=<8-char mutation prefix>`, `attempts=…` and `rtt=…ms` on acknowledgement. There is a new `commandAcknowledgedByContext` event.
  - The phone `WatchBridge` line now carries the same `m=` prefix plus `queue=` (WatchConnectivity → main actor), `mutate=` (router + persist + synchronous observers), `publish=` (context + finish reconcile) and `app=` (active / inactive / background).
- **Deliberately not changed (needs measurement first):** phone-side "reply before side effects" and building the projection once per command.

## Server candidate (NOT deployed) — Issue 5 trusted Watch correlation

- **Branch:** `claude/server-trusted-watch-uuid-case-20261005`, from production `c7c99347`.
- **Fix.** `reconcileHealthKitWorkoutObservation` now:
  - matches the exact session case-insensitively, for the UUID suffix and for the already-claimed check;
  - always names the session's **stored** canonical id in the link.
- **New tests:**
  - the uppercase Native draft id links;
  - the HealthKit-first race links on the next pass;
  - a case-variant of an already-claimed session stays claimed.
- **Effect of deploying it:** the next HealthKit ingest batch would confirm today's Watch workout ↔ Logger session link through the normal reassessment path. That is a production data change, so the deploy needs explicit exact-SHA authorization.

## Integration map (for the final next-build authority, after Founder review)

- **Native:** cherry-pick the candidate commits onto the next-build authority branch (currently Batch 2 RC `793462b1` / Build 88 lane) in order. The commits touch:
  - `TrainingLoggerReadModel`, `ProductionDailyDriverAPI`, `TrainingSessionAuthority`, `WatchWorkoutFinishCoordinator`, `WatchWorkoutConnectivityBridge`;
  - `TrainingLoggerView` / `TrainingLoggerViewModel`, `WatchWorkoutStore`;
  - tests in `Build83FinishLifecycleTests`, `TrainingLoggerTests` and `WatchWorkoutFinishStateTests`.

  No project-generator changes and no new files. Expect conflicts only where Batch 2 also edited `TrainingLoggerView`/`TrainingLoggerViewModel`; resolve them by keeping both. No build number bump was made.
- **Server:** independent of Native. Deploy order does not matter: Native already sends the lowercase id, and the Server fix accepts both cases.

## Validation

**iOS unit tests:**
- Targeted classes: 233 tests, 0 failures. These are:
  - `Build83FinishLifecycleTests` (41, of which 5 are new);
  - `Build87SupersetHistoryContextTests` (5 new);
  - `TrainingLoggerTests`, `TrainingSessionAuthorityTests`, `TrainingLoadSemanticsTests`.
- Full `PhysiqueOSTests`: 2015 tests, 1 skipped, **1 failure**. The failure is the known baseline `PeptideSupportEditorViewModelTests` line 616, which fails identically on earlier builds.

**Watch unit tests:** `PhysiqueOSWatchTests` 49/49, of which 2 are new.

**New deterministic tests:**
- Watch-origin finish hydrates the Server recap with 0 read-backs, and the record list is identical to the commit's.
- After relaunch, the persisted records are shown with no network.
- Unknown records:
  - deferred + failed read → empty, never fabricated;
  - refresh re-reads them;
  - a known list is never re-read.
- A known empty list is authoritative.
- Superset sequence A1→B1→A2→B2→next unit; each acknowledgement names its tap.
- Production history mapping keeps the superset context; older payloads stay standalone.
- Pairing shows 09-14-style superset Previous history, and unpairing returns to standalone.
- Removing a partner refreshes the survivor.
- Guidance never rewrites or un-completes a completed set.
- Superset-context values reach the Watch projection through the authority.
- A Watch context naming the pending Complete Set settles it; an unrelated context does not.
- An unsent tap never shows "Set pending".

**Not run:** wall-clock latency tests (by design), UI tests, Release archive.

**Server tests:**
- `HealthKitWorkoutDormantFoundation.test.js`: 82/82, of which 3 are new.
- 53 HealthKit/Watch/relationship test files: 902 passed, 4 failed. The same 4 fail at production base `c7c99347`: they are bundle-builder and git-diff audit tests, not affected by this change.

**Zero-write audit:** six read-only production probes. Production writes: 0.

## Still requires Founder decisions (not implemented)

1. **Issue 2-B:** when a superset is paired or unpaired, should uncompleted, untouched set rows auto-refill from that context's previous session? If the superset has no history, should they keep the standalone values or be cleared?
2. **Issue 2-C:** approve an additive Server field, `contextualProgressionRecommendations`, so Suggested/Maintain is shown in superset context.
3. **Issue 5:** authorize deploying Server `b5de242f`. The next ingest batch would then confirm today's Watch workout ↔ Logger session link, which is a production data change.
4. **Issue 1 follow-up:** phone-side "reply before side effects" and one projection build per command. Decide after the next workout's correlatable logs from this candidate. Today's device logs need root `log collect` or sysdiagnose on the iPhone and Watch.
5. **Issue 4** (Review gating + timed sets): kept separately scoped. Recommendation: one follow-up that derives the Watch phase and row semantics from `TrainingSessionLiveProjection`.

## Test plan for the next real workout (after a build that contains `cd06bfea`)

- Do a superset and a standalone exercise, then finish on the Watch.
- **Expected on the phone:** the full Workout Complete recap with PRs, and confetti once, when a PR is earned.
- **Pairing:** after pairing, Previous switches to the superset history.
- **Logs to capture:**
  - Watch `WatchLatency` lines with `kind=completeSet m=… rtt=…`;
  - phone `WatchBridge` lines with `m=… queue= mutate= publish= app=`;
  - pair them by `m=` to get the per-tap chain for ordinary vs superset transitions.
