# Workout reliability lane — Build 87 real-session audit (Watch supersets, superset guidance, Watch-finish recap)

Task id: `workout-watch-superset-real-session-audit-20261005`
Lane: **Workout reliability lane** (separate from Redesign Batch 3 and from the Batch 2 / Build 88 release gate).
Prompt: `agent-handoffs/inbox/prompts/20261005T200100Z-workout-watch-superset-real-session-audit.md` @ `fe35ed66`.
Agent: Claude (single Remote Control worktree, no EnterWorktree).
Stage: **AUDIT (checkpoint 1 of 2)**. Bounded fixes follow in a separate candidate report.

## Authority (re-verified live)

| Item | Value |
|---|---|
| Native audited | Build 87 `f66c7fc6` (branch `claude/build87-workout-reliability-audit-20261005`) |
| Production Server | `c7c99347`, deployment `e7ef3157` (ACTIVE, health `/api/v1/health/live` buildId `physiqueos-c7c99347-20261005`) |
| Production access | read-only only: six `REPEATABLE READ READ ONLY` probes, SELECT-only guard, explicit ROLLBACK. Production writes: **0** |
| Build / TestFlight | untouched. Build 88 is still release-gated separately |

## The real session (2026-10-05)

| Fact | Evidence |
|---|---|
| Logger draft | `B1CB418C…`, canonical `training|authoritative|training_logger_draft_B1CB418C…`, logger_mode `live` |
| Window | Logger start 15:07:18.9Z → end 16:04:53.2Z (3454 s) |
| Structure | 4 exercises / 15 sets: Leg Extensions 4×(40×30), Sissy Squats 4×(45×15), Pendulum Squat 4×(55×11), Walking Lunge 3×(60×20) |
| Superset | ONE `exerciseRelationshipGroups` entry, type `superset`, members [Leg Extensions (A), Sissy Squats (B)]. Pendulum and Lunge were standalone |
| Commit | `training-session.commit.v1` committed **once** at 16:04:54.365Z, ~1.2 s after the Watch-stamped end. Result `durable`; durationMs 4205 (canonicalLoadMs 3361 dominates) |
| Server PRs in the commit response | `performanceRecords.status = completed`, **2 records**: Sissy Squats session volume 2,700 lb (prev 2,400, superset context), Walking Lunge session volume 3,600 lb (prev 2,400, standalone) |
| Durable PR events | 2 `trainingPerformanceEvents`. The Sissy event carries `relationshipContext` (superset, partner leg_extension, memberIndex 1) |
| Apple workouts today | (a) Apple outdoor walk 14:48–15:06Z. (b) **PhysiqueOS Watch** Traditional Strength (type 50, indoor) 15:07:33–16:04:53Z, 443.9 active kcal, avg HR 124. (c) Apple outdoor walk 16:06–16:23Z. No overlap and no duplicate strength record |

Not available server-side: per-set completion timestamps and any Watch/phone latency telemetry. The canonical evidence stores no per-set times, and Native latency traces are on-device only (see Issue 1).

---

## Issue 1 — Watch Complete Set latency

**Observed evidence**
- No Server or network call sits on the Complete Set path (proven from code). Server data therefore cannot place today's lag.
- I could not produce the per-tap timestamp chain from existing evidence. The only instrumentation is on-device os_log:
  - Watch: subsystem `com.physiqueos.native.dev.watchkitapp`, category `WatchLatency`, events `commandIssued` / `commandAcknowledged` / `acknowledgementApplied` / `contextApplied` / `completeSetEnabled|Disabled` / `reachable|unreachable`.
  - Phone: subsystem `com.physiqueos.native.dev`, category `WatchBridge`, `route <kind> -> <status> <ms>ms`.
- Each Watch line is only `"<event> +Nms since activation"`. It has no command kind, no mutation id and no round-trip time, so ordinary vs superset transitions cannot be paired even with the logs.
- These logs are `.notice` level and probably still on the devices. Pulling them needs root: `sudo log collect --device-udid <phone> --start "2026-10-05 07:55:00"`, then the same for the Watch. Alternatively, sysdiagnose on both devices.

**Code path (proven)**
1. Watch tap → `WatchWorkoutStore.completeSet()` (`ios/PhysiqueOSWatch/WatchWorkoutStore.swift` ~599) → `issue()` (~728).
2. Single-flight `gate.begin`, then `sendMessageData` with a reply handler (~806). A lost reply has a 12 s watchdog and a 2/4/8 s backoff, max 4 attempts.
3. Phone `WatchWorkoutConnectivityBridge.route` (~116) → `WatchWorkoutCommandRouter.route` → `TrainingSessionAuthority.completeSet` → `mutate`.
4. `mutate` persists the whole draft collection (`UserDefaultsTrainingLoggerDraftStore.persist`, decode + re-encode), then synchronously runs every observer.
5. Those observers do the following before the reply is sent:
   - Watch projection build #1 + `updateApplicationContext` #1;
   - finish-coordinator reconcile;
   - Home widget snapshot read/atomic write + `WidgetCenter.reload` (every set changes `completedSets`);
   - router ack projection build #2;
   - bridge `publishCurrentProjection` build #3 + `updateApplicationContext` #2.
6. Watch reply → `receiveAcknowledgement` → `gate.acknowledge` → `apply`.

**Local UI acknowledgement (proven)**
- The only local change is the 0.45 dim from `isCompleteSetAvailable = canCompleteSet && gate.pending == nil && reachable`. There is no pressed state, no tap haptic and no optimistic row.
- The dim clears **only** on the matching reply. An application context that already carries `lastAcknowledgedMutationId` for the pending command does not clear it, so a lost or late reply keeps the button dim for at least 12 s.
- **Defect:** a tap while `isReachable == false` sets `notice = .setPending`, then `issue()` returns false. The tap is dropped and "SET PENDING…" stays on screen.

**Superset next-step (proven)**
- `TrainingSessionCursor` (`ios/PhysiqueOS/Contracts/TrainingSessionLiveProjection.swift` ~366–486) is pure and phone-side. It gives A1→B1→A2 and B→next-round A, then the next unit when exhausted.
- It adds **no extra round trips or projections** for supersets.
- Why supersets feel worse is inferred, not proven. Superset taps come back-to-back with no rest, so tap N+1 can queue behind tap N's leftover main-actor work: widget reload, Live Activity sync and two context transfers. Also, A→B replaces the whole row, which makes the wait visible.

**Distance (inferred)** The button is dimmed and taps are refused whenever `isReachable` is false. Bluetooth degradation at 10–15 ft lengthens `sendMessage` round trips and causes reachability flaps.

**Ranked hypotheses**
1. Round-trip-gated feedback with no optimistic local acknowledgement. The design is proven; the magnitude is not measured.
2. Synchronous phone work before the reply. Proven to exist; contribution not measured.
3. Reachability flapping and dropped unreachable taps. Proven code; contribution not measured.
4. Stale-revision resend round trip. Inferred; check WatchBridge for `completeSet -> stale`.
5. Tap recognition delay inside nested paged TabViews. This would explain lag *before* the dim; inferred.

**Classification:** existing design (round-trip-gated UI) plus two missing-wiring defects (gate not cleared by a context ack; unreachable tap lost).

**Minimal safe fix (Native only, no Server)**
- (a) Clear the pending gate when an incoming projection's `lastAcknowledgedMutationId` equals the pending mutation id.
- (b) Do not set `.setPending` or swallow the tap when it cannot be sent.
- (c) Enrich the Watch trace with command kind, a short mutation id and an explicit issued→acknowledged round-trip ms. Log phone receipt time before the MainActor hop, the phone app state, and whether the context or the reply arrived first.
- Phone-side "reply before side effects" and one projection build per command are **recommended**, but deferred until (c) measures their share.

**Test plan:** deterministic store tests using `commandSinkForTesting`:
- a context ack clears the gate;
- an unreachable tap does not leave `.setPending`;
- a router + authority superset sequence A1→B1→A2→B2→next unit asserts the Watch target after each ack.

No wall-clock latency tests.

**New Native build required:** yes, for (a)–(c). **Server dependency:** none.

---

## Issue 2 — Superset membership must refresh contextual guidance

**Server architecture (proven): superset performance IS tracked separately from standalone.**
- Context is derived from the session's `exerciseRelationshipGroups`: `deriveTrainingExerciseRelationshipContext` and comparison key `standalone` | `superset|partners:<sorted ids>`, in `src/domain/models/trainingExerciseRelationship.js`.
- PR detection (`TrainingPerformanceIntelligenceService.createExercisePerformanceObservation`) and progression (`TrainingLoggerProgressionService.listComparablePerformances`) both filter on that key.

**Real-data proof:**
- **2026-09-14** has a superset Leg Extensions (80×15 ×4) + Sissy Squats (50×12 ×4 = 2,400 lb).
- Today's Sissy PR compares 2,700 against exactly that superset baseline of 2,400. The standalone Sissy best is 2,430 (07-28) and was not used.
- Leg Extensions today (4,800 lb in superset) correctly did **not** PR against its standalone 5,400 best.
- So the Founder's belief is correct, and today's PRs are legitimate and context-isolated.

**Native production Logger (proven): the context is dropped.**

Failure 1: history is never tagged with superset context.
- The Server's `training-logger` `initialHistorySessions` includes each exercise `id` and the session's `exerciseRelationshipGroups` (prod `CoreNavigationReadService.projectTrainingHistorySession`, 120 newest sessions, so 09-14 is included).
- Native `ProductionTrainingLoggerAPI.history(for:)` (`ios/PhysiqueOS/Networking/ProductionDailyDriverAPI.swift` ~1599) hard-codes `relationship: nil`. `HistorySession`/`HistoryExercise` do not decode the groups or the exercise id.
- Consequences:
  - after pairing, the superset "Previous" lookup (`TrainingExerciseHistoryCalculator.previousComparableOccurrence`) can never match, so the card says "No comparable prior performance…";
  - the standalone "Previous" silently includes superset sessions such as 09-14, unlike the Server.

Failure 2: Suggested/Maintain is standalone-only.
- `initialProgressionRecommendations` are computed once per exercise **standalone only**: `projectTrainingLoggerRecommendation` passes no `relationshipContext`.
- No Server endpoint takes a draft or superset context. Web already re-selects with context (`TrainingLoggerPreviewState.selectDraftProgressionRecommendation` / `refreshComparableContexts`).

Failure 3: pairing does not touch the set values.
- `TrainingLoggerDraft.setSuperset` / `removeSuperset` → `refreshPreviousPerformance` (`TrainingLoggerReadModel.swift` ~738–831) recomputes Previous with the relationship and deliberately sets `progressionRecommendation = nil` for any relationship (current design).
- It never touches set values. Uncompleted rows keep the standalone pre-fill, and the Watch shows exactly those values.

Smaller gaps:
- `removeExercise` does not refresh the surviving partner.
- The catalog-miss early return keeps a stale recommendation.

**Separate hazard (proven by code):** `applyProgressionSuggestion` and `keepPreviousPerformance` overwrite **every** set, including completed ones, and reset `isCompleted = false`. That violates completed-set immutability.

**Watch:** it never sees recommendations, only draft set values. Any change to draft set values reaches the Watch through the normal revision/projection path.

**Classification**
- Native history mapping: **missing wiring**.
- Superset Suggested/Maintain withheld: **existing design**.
- Set rows not refilled on a context change: **missing design (needs a Founder decision)**.

**Minimal safe fix**
- **A (Native, no semantics change, implementing now):**
  - Decode `exerciseRelationshipGroups` and exercise `id`, and build `TrainingLoggerHistoryRelationship` (partner canonical ids and names). Pairing then immediately shows the superset-context Previous: Leg Ext 80×15, Sissy 50×12 from 09-14.
  - Refresh the surviving partner on `removeExercise`.
  - Clear the stale recommendation on catalog miss.
  - Make `applyProgressionSuggestion` / `keepPreviousPerformance` skip completed sets.
- **B (needs Founder decision, NOT implemented):** auto-refill uncompleted, untouched set rows with the superset-context previous values on pair/unpair. Open question: what should rows show when no superset history exists (keep standalone vs clear)?
- **C (needs Founder approval, Server, NOT implemented):** an additive `contextualProgressionRecommendations` field so Suggested/Maintain can be shown in superset context.
  - It is the same Server function with `relationshipContext`, exactly as Web does.
  - No schema/persistence change.
  - Native and Server comparison keys differ (`superset:a,b` vs `superset|partners:a,b`), so the key must be sent explicitly.

**Test plan:** decode a production-shaped payload with a superset group → relationship tagged; a standalone session → nil. Also:
- standalone 08-25 vs superset 09-14: pair → previous 09-14, unpair → standalone;
- completed set untouched by suggestion/keep;
- `removeExercise(partner)` refreshes the survivor.

**New Native build required:** yes (A). **Server dependency:** none for A; C would need a Server deploy.

---

## Issue 3 — Watch-finished workout shows reduced phone recap

**Observed evidence (proven)**
- Today's commit response already contained `performanceRecords.status = completed` with 2 records.
- The Watch-origin finish path (`WatchWorkoutFinishCoordinator.commitWithRetries` → `recordServerSuccess`, `ios/PhysiqueOS/Networking/WatchWorkoutFinishCoordinator.swift` ~139–187) **keeps only `prCount`**: `TrainingSessionAuthority.recordWatchServerCommit` → `draft.watchAuthoritativePRCount`. The record list is dropped.
- The phone's retained completion is then presented through `presentRecoveredCompletion(commitResult: nil)`. That issues one un-awaited, unretried `sessionPerformanceRecords` read (`try?` → nil on any failure).
- Once `completedDraft` is set, nothing re-reads:
  - `load()` returns early when configured;
  - `resume(draftId:)` returns early for the same draft;
  - foregrounding does not refresh.
- An empty record list renders the same Workout Complete view without the records card. That card is the screen's only confetti trigger, so the Founder got "Workout logged / Workout confirmed / Return to Log" with no recap or confetti.

**Root cause:** missing wiring, not design. The Server authority had the PRs; the Watch path threw them away and the fallback read is single-shot.
- The exact moment the read failed (app suspended after the finish background assertion ended) is **inferred**.
- Cheap confirmation: if the Watch summary showed "2 PRs", the coordinator had the records and the phone fallback read failed.

**Minimal safe fix (Native only, implementing now)**
- Persist the coordinator's **Server-authoritative** record list on the retained completion (Codable, optional, forward-compatible). Present the recovered completion from it. The count stays derived.
- Track "records unknown" separately from "none", and re-read on appear / scene-active while unknown.
- Confetti is unchanged: `WorkoutCelebrationGate` key `physiqueos.workoutComplete.celebrated.<draftId>` gives one celebration per draft, respects Reduce Motion, and only the phone celebrates (the Watch shows a count), so nothing duplicates across devices.
- No client-side PR computation.

**Test plan:**
- Watch-origin coordinator commit with authoritative records + a failing fallback read → `completedPerformanceRecords == records` (identical to the phone-origin list);
- relaunch → records from persistence, no network;
- read nil then success → records appear on refresh;
- deferred commit status never fabricates records;
- celebration claimed once, Reduce Motion variant.

**New Native build required:** yes. **Server dependency:** none. A minor Server note: the `training-session` read reports `status: completed` even when derivation was deferred at commit time.

---

## Issue 4 — Related Watch projection backlog

- **Complete Set offered during phone Review/Confirmation (root cause proven).**
  - `WatchWorkoutProjection.phase(of:)` (`ios/PhysiqueOS/Networking/WatchWorkoutProjectionMapper.swift` ~81–88) ignores `draft.step`, so summary/evidence/review map to `.active` and `canComplete` stays true.
  - The Live Activity mapper correctly uses `TrainingSessionLiveProjection.phase == .reviewing`.
  - The phone then rejects the tap as `sessionNotMutable`.
- **Timed sets (root cause proven).**
  - The Watch row contract has no measurement type or duration, so a duration set renders LOAD/REPS "—/—".
  - `canCompleteSet` ignores missing values. The phone's `setValuesIncomplete` is mapped to the misleading `.sessionNotMutable`.
- **Overlap:** these two share a root with each other (the Watch mapper re-derives phase and row semantics separately from `TrainingSessionLiveProjection`), but **not** with Issues 1–3.
- **Recommendation:** keep them separately scoped as one follow-up: derive Watch phase/row semantics from `TrainingSessionLiveProjection` and add a measurement/duration field to the Watch row contract. Not patched in this lane.

---

## Issue 5 — HealthKit / workout recording safety (read-only)

**Proven**
- Canonical Logger workout exists, committed exactly once (see the real session).
- The PhysiqueOS Watch recorded one Traditional Strength HealthKit workout inside the Logger window, with energy and HR. There is no duplicate and no truncated strength workout. The two Apple outdoor walks are separate, non-overlapping cardio workouts.
- Activity interaction is `workout_energy_is_descriptive_never_additive`, and evidence eligibility is quarantined for strength (expected).

**NEW defect (proven):** the trusted Watch↔Logger exact correlation silently failed for this first trusted workout.
- The trusted-Watch correlation policy became effective 2026-10-05T07:00Z. This was its **first real workout**.
- The Watch HealthKit observation carries `physiqueOSSessionId = "b1cb418c-…"` (**lowercase**). That is by design on both sides:
  - Native `HealthKitTrustedWorkoutCorrelation.extract` returns `uuidString.lowercased()`;
  - Server `uuidText` lowercases.
- The Server builds `expectedCanonicalId = "training|authoritative|training_logger_draft_" + exactSessionId` (`src/domain/services/HealthKitObservationService.js` `reconcileHealthKitWorkoutObservation`, prod ~431–446) and compares it case-sensitively. The canonical session id uses the Native draft id in **uppercase** (`…_B1CB418C…`). The comparison fails → `trusted_session_not_found`.
- `reassessWorkoutRelationships` treats that reason as an ordering race and `continue`s with no link, no `linkAssessment` and no Founder review.
- The 14 ingest batches after the workout all report `updated: 0`. Today's strength workout has `linkAssessment: null` and no link record, so it stays unlinked indefinitely.
- Server tests use a lowercase draft id in the canonical id, which is why they never caught it.

**Classification:** missing wiring (cross-contract case mismatch).

**Minimal safe fix (Server only):**
- Match the canonical session id case-insensitively for the UUID suffix, or build the expected id from the uppercased UUID.
- Add a regression test with an uppercase draft id.

**After an authorized deploy:** the next ingest batch would link today's workout through the normal reassessment path (prospective: workout start 15:07:33Z ≥ effectiveAt). **That is a production data change, so it needs explicit Founder authorization.** I will prepare it as an undeployed Server candidate only.

Today's manual-review alternative: no review was opened, so the Founder currently has nothing to confirm.

---

## Summary table

| Issue | Root cause | Type | Fix now? | Native build | Server |
|---|---|---|---|---|---|
| 1 latency | round-trip-gated UI; gate ignores context ack; unreachable tap lost; no correlatable telemetry | design + missing wiring | (a)(b)(c) yes; phone reorder after measurement | yes | no |
| 2 superset guidance | Native drops history relationship context; recommendations standalone-only; rows not refilled; completed sets overwritable | missing wiring + design gap | A yes; B/C need Founder | yes | C only |
| 3 Watch-finish recap | Watch path drops Server PR list; single-shot fallback read | missing wiring | yes | yes | no |
| 4 projection backlog | Watch mapper diverges from live projection | separate root | no (recommend follow-up) | — | no |
| 5 HealthKit correlation | UUID case mismatch in Server exact correlation | missing wiring | Server candidate only, no deploy | no | yes (deploy needs auth) |

## Decisions required

1. Issue 2-B: on superset pair/unpair, should uncompleted, untouched set rows auto-refill from that context's previous session? If there is no context history, keep standalone or clear?
2. Issue 2-C: approve the additive Server `contextualProgressionRecommendations` so Suggested/Maintain show in superset context.
3. Issue 5: authorize deploying the Server UUID-case correlation fix. This auto-links today's Watch workout on the next ingest.
4. Issue 1: optionally capture iPhone + Watch logs now (root `log collect` or sysdiagnose) while today's WatchLatency notices are retained.

## Safety

- Production writes: 0. No deploy, no TestFlight, no build bump, no merge into the Batch 2 release candidate.
- The Batch 3 lane pointers are referenced, not replaced.
