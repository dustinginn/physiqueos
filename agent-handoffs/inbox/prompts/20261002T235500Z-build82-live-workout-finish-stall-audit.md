LIVE INCIDENT — Build 82 real workout finish saga stuck across Watch and iPhone

TASK TYPE

Claude urgent live read-only incident audit.

Founder is currently leaving BOTH devices untouched in the stuck state so the incident can be inspected while live.

DO NOT mutate production.
DO NOT send commands to the active workout.
DO NOT finish/cancel/retry/save the workout.
DO NOT manipulate HealthKit.
DO NOT deploy.
DO NOT create a Native build.
DO NOT ask Founder to force-quit or navigate away until the audit captures the state.

READ FIRST

Build 82/TestFlight:
agent-handoffs/reports/20261002T213500Z-build82-sleep-v3-native-integration-activation.md

Watch Phase 1A:
agent-handoffs/reports/20261002T074000Z-apple-watch-workout-v1-phase1a-final.md
agent-handoffs/reports/20261002T173031Z-watch-v1-cancel-workout-parity-physical-checkpoint.md

Find/read current TrainingSessionAuthority, finish saga, Watch command router, Live Activity, workout commit, accepted_processing, Evidence Review and HealthKit reconciliation implementation/reports.

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

LIVE FOUNDER OBSERVATION

Date: 2026-10-02 local.
Real physical workout on TestFlight Build 82.

Workout:
- Chest;
- 3 exercises;
- 13 completed sets shown by phone Final Confirmation;
- paired Apple Watch workout active;
- sets were completed through both Watch and phone during the workout.

Observed sequence:

1. Founder finished the workout from Watch.
2. Watch entered "Finishing safely…".
3. Watch remained there for approximately 3 minutes.
4. During/after Finish, Watch rest stopwatch continued ticking. This is separately incorrect terminal behavior.
5. iPhone still showed the workout as active with Finish Workout available.
6. Founder then tapped Finish Workout ONCE on iPhone.
7. Phone reached Final Confirmation:
   - "Workout ready"
   - 3 exercises
   - 13 completed sets
8. Founder confirmed Finish on phone.
9. Phone is now stuck at:
   - Final Confirmation
   - button "Saving…"
10. Watch remains stuck in its finishing state.

Founder has now stopped interacting and will leave both apps exactly as-is.

This proves the problem is not merely Watch terminal UI. The phone's finish/commit lifecycle is also blocked.

A. REVERIFY AUTHORITIES

Fetch origin/main.

Identify:
- exact Build 82 Native source SHA;
- exact production Server SHA/deployment;
- exact current Training/HealthKit contract versions;
- any changes since Build 82 report.

B. LIVE PRODUCTION READ-ONLY CAPTURE — PRIORITY

Use the approved least-privilege production-read path.

Requirements:
- bounded owner-scoped SELECTs;
- BEGIN READ ONLY;
- verify transaction_read_only=on;
- no credentials;
- no mutation;
- stop on auth/read-only failure.

Capture the current workout/session state while Founder leaves devices untouched.

Locate, without guessing:
- active/draft Training session;
- session id;
- revision;
- lifecycle/phase;
- completed set count;
- exercise count;
- performed projection if materialized;
- finishOperationId if present;
- pending completion/commit records;
- accepted_processing records;
- Evidence Review/pending evidence records;
- canonical Training evidence;
- workout commit idempotency keys;
- any command/mutation records;
- HealthKit workout/reconciliation observations if already received;
- exact-correlation state;
- Live Activity/server lifecycle state if persisted;
- errors/retry metadata;
- timestamps for the Finish attempts.

Sanitize report values; do not expose sensitive raw workout details beyond what Founder already stated.

C. SERVER LOG CORRELATION

Read bounded production logs around the incident window.

Correlate:
- Watch finish request if Server-visible;
- phone finish request;
- workout commit endpoint;
- status codes;
- latency;
- timeout;
- thrown errors;
- duplicate/idempotent responses;
- transaction rollback;
- accepted_processing;
- HealthKit ingestion/reconciliation;
- retries.

Determine whether:
1. no commit request reached Server;
2. request reached and is still pending;
3. Server committed but Native failed to observe ack;
4. Server rejected;
5. duplicate/idempotency collision;
6. HealthKit leg blocked structured finish;
7. another state.

Do not infer from absence of one log source if telemetry is incomplete.

D. NATIVE FINISH SAGA AUDIT

Trace exact Build 82 source.

Map:
Watch Finish:
Watch UI
-> Watch command
-> WCSession
-> phone WatchWorkoutCommandRouter
-> TrainingSessionAuthority
-> Watch HealthKit finish
-> phone structured finish
-> server commit
-> acknowledgement/projection
-> Live Activity end
-> Watch summary.

Phone Finish:
Workout Logger
-> Workout Review
-> Final Confirmation
-> Saving
-> same/different finish operation.

Identify whether Watch and phone truly share:
- one finishOperationId;
- one idempotency key;
- one authority lifecycle;
or whether phone created a second competing finish.

E. HEALTHKIT LEG

Read-only inspect what can safely be inspected from source/server state.

Determine:
- did Watch HKWorkoutSession end?
- did HKLiveWorkoutBuilder finish/save?
- did HealthKit workout arrive back through ingestion?
- is exact correlation pending?
- is structured commit incorrectly waiting for HealthKit completion?
- could HealthKit authorization/session finalization block indefinitely?
- timeout/recovery behavior.

Do NOT manipulate the active HealthKit session in this audit.

F. PERFORMED DATA SAFETY

Prove whether the 13 completed sets are safe.

Determine:
- whether authoritative draft still contains all 13 completed sets;
- whether Server already committed them;
- whether there is any duplicate canonical workout;
- whether another Finish attempt risks duplication;
- whether force-quit would lose anything;
- whether Save & Leave is safe/unsafe;
- whether Cancel would destroy data.

This section is required BEFORE recommending any Founder recovery action.

G. STOPWATCH TERMINAL BUG

Separately audit why rest Stopwatch continues after Finish begins.

Desired invariant:
once Finish is confirmed and session enters finishing/terminal transition:
- rest timer stops/freeze-clears immediately;
- countdown haptics stop;
- no active rest UI.

Do not patch yet; include root cause if apparent.

H. TIMING / UX

Measure expected finish timings from code:
- structured commit timeout;
- HealthKit finish timeout;
- retry intervals;
- accepted_processing polling;
- UI timeout/fallback.

A multi-minute indefinite "Finishing safely…" / "Saving…" state is not acceptable.

Identify missing timeout/error/recovery UI.

I. RECOVERY RECOMMENDATION — ONLY AFTER CAPTURE

After live state is fully captured, give exactly one safest Founder action.

Possible outcomes may be:
- wait because Server is actually processing;
- force-quit/relaunch because durable state is safe;
- Save & Leave;
- retry same idempotent Finish;
- another action.

Do not recommend until data safety and idempotency are proven.

If recovery requires a production mutation/manual repair:
STOP and ask Founder authorization with exact bounded change.
Do not perform it.

J. PATCH PLAN

After root cause, prepare a minimal patch plan covering:
- actual finish-saga defect;
- shared Watch/phone finish idempotency;
- bounded timeout;
- terminal rest timer;
- recoverable error state;
- no duplicate workout;
- relaunch recovery;
- exact HealthKit correlation behavior.

Do not implement in this incident-audit task unless Founder explicitly authorizes after reviewing findings.

K. TEST REPRODUCTION

Specify deterministic tests reproducing today's exact sequence:

Watch Finish
-> finishing
-> no completion for 3 min
-> phone Finish
-> Final Confirmation
-> Saving stuck.

Include:
- HealthKit finish delayed;
- Server commit delayed;
- lost Watch ack;
- lost phone ack;
- Server committed but response lost;
- duplicate Finish;
- phone Finish while Watch finish in flight;
- app relaunch;
- no duplicate evidence;
- 13 sets preserved;
- rest timer stops on finishing.

L. OTHER WORKOUT FINDINGS

Do not mix the other UI findings into the live incident fix, but record that a later consolidated post-workout patch exists:
- fixed non-scrollable Watch execution layout;
- green progress bar;
- metrics order/colors;
- third Daily Totals page;
- intermittent/likely-user-error Add Set audit.

M. REPORT

Publish ASAP after live capture:
agent-handoffs/reports/<timestamp>-build82-live-workout-finish-stall-audit.md

Include:
- live production snapshot;
- logs;
- exact root cause or narrowed hypotheses;
- 13-set safety;
- duplicate risk;
- safest Founder recovery action;
- stopwatch finding;
- patch plan;
- no mutation ledger.

Update latest pointers.

MANDATORY GH PROTOCOL

Before stopping:
- publish report to origin/main;
- fetch/reverify main;
- re-read exact report;
- provide exact main report SHA.

If the audit is taking time, publish an early checkpoint once the live production state has been safely captured so the evidence survives.

END TASK.
