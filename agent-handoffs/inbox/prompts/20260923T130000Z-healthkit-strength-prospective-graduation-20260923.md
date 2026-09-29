Task id: healthkit-strength-prospective-graduation-20260923

Graduate HealthKit Strength Workout ingestion prospectively into normal PhysiqueOS operation beginning Founder-local 2026-09-23, using the accepted Sep 22 Strength canary/link-confirmation result as the proving basis.

Continue in the current Claude HealthKit chat. Sonnet High.

Notification requirement:
Notify/question the Founder in Claude chat whenever explicit authorization is required, when a physical-device action is needed, and when substantive work completes. If Founder authorization is the only blocker, ask directly, wait for the response, then continue. Do not terminate the task merely to request authorization.

Reverify current authority. Expected hints:
Production Server 7c5710f2111e822caaf0d8992ce555f004d3c79b
deployment 289c571c-e61b-4fab-bb59-acf3e63549dd
Native Build 53 SHA 1c57556f

Accepted proving basis:
agent-handoffs/reports/20260923T124316Z-healthkit-sep22-strength-link-confirmed-policy-closed.md

Proven on Sep 22:
- HealthKit Strength observation ingested and canonicalized correctly.
- Correct existing Workout Logger session matched at confident_match 99.
- Guarded confirmation succeeded with one-to-one integrity.
- Logger exercises/sets/reps/load/variants/supersets/notes remained byte-identical.
- Same-day screenshot support was merged into the same logical Logger event, not duplicated.
- Two walks remained separate.
- strategic/V3/Confidence/briefing eligibility remained OFF.
- canary policy was closed cleanly.

Founder product decision:
From now on, while HealthKit is working, Founder will not upload Apple Fitness screenshots for workouts. Normal future workflow is:
Strength: Workout Logger owns detailed strength structure; HealthKit supplies Apple workout/session telemetry and reconciliation/linking.
Cardio: HealthKit is intended to be the normal canonical workout source; cardio graduation remains a separate follow-up.

Goal:
Turn Strength Workout ingestion/matching live prospectively beginning 2026-09-23, without historical backfill and without requiring Founder canary/manual Workout Sync in normal use.

Part 1 — graduation readiness and missing-gap audit

Before writes:
- reverify Sep 22 accepted state remains intact;
- verify no open Workout policy remains from Sep 22;
- audit current normal automatic Workout observation path in Build 53;
- determine whether automatic/background Workout ingestion is already wired or only the Founder canary/manual path exists;
- verify exact policy needed for open-ended Strength-only prospective ingestion beginning 2026-09-23;
- ensure cardio workout types are NOT unintentionally graduated by this Strength-only policy;
- verify matching remains candidate-first and does not silently auto-confirm unless existing product semantics explicitly authorize that;
- verify Logger remains authoritative for detailed strength structure;
- verify confirmed relationship is the gate for any later strategic eligibility;
- verify Activity/Nutrition automatic ingestion remains unaffected.

Known gap to account for:
Build 53 does not emit sourceRevision for workouts. Revised HKWorkout aggregates for the same UUID currently fail closed with 409 rather than update. Audit whether initial prospective Strength ingestion can safely graduate with this limitation temporarily. If yes, keep graduation bounded to initial ingestion/matching and create a follow-up for workout revision support before declaring the full Workout integration finished. If no, implement/review the smallest correct fix first.

Also re-audit whether the read-only training-audit tooling at 3a47b7fd needs deployment or mapping correction before this graduation. Do not deploy unrelated tooling unless actually required for safe authority/audit.

Part 2 — normal automatic ingestion requirement

Founder should not need:
- Founder Canary master toggle;
- Request Apple Health authorization on every visit;
- Sync workouts for this day;
- test-date selection;
- screenshots.

If Build 53 normal automatic coordinator does not yet observe/upload Strength workouts prospectively, implement the smallest correct Native/Server changes required so that normal HealthKit automation covers Strength workouts.

Desired normal flow:
Apple Health Strength workout completes/changes -> PhysiqueOS observes it automatically or catches it up on foreground -> canonical HealthKit Workout -> match candidate against the correct Logger session -> guarded relationship state -> normal Training surfaces.

Preserve architectural separation:
HealthKit observation -> canonical Workout -> reconciliation/link relationship -> strategic evidence eligibility separately.

Do not auto-link ambiguous matches.
Do not create duplicate detailed Training sessions.
Do not overwrite Logger detail.
Do not make screenshots part of normal future workflow.

If Native changes are required, this becomes the next sequential Native build after Build 53. Do not mix unrelated performance/Training-performance backlog work into it.

Part 3 — prospective Strength policy

Prepare exact prospective policy semantics:
- domain: Workout / Strength-only types appropriate to Logger reconciliation;
- effective_from: 2026-09-23 Founder-local;
- open-ended;
- historical_backfill: false;
- no Sep 22 re-ingest requirement;
- cardio remains excluded from graduation;
- strategic/V3 eligibility remains OFF initially unless separately authorized in this task after real live acceptance;
- matching/link auto-confirm stays OFF unless explicit reviewed product semantics say otherwise.

Dry-run first.
Zero-write pre-audit.
Ask Founder directly in Claude chat for explicit authorization before production policy activation.
After approval, activate and verify exact policy.

Part 4 — today's real live Strength acceptance

Founder expects to perform a normal strength workout shortly on 2026-09-23.

After policy/capability is live, notify Founder with normal-use instructions only:
- use Workout Logger normally;
- allow Apple Watch/Apple Health to record the Strength workout normally;
- do NOT upload workout screenshots;
- do NOT use Founder Canary/manual Workout Sync;
- do NOT do special test-day actions;
- finish/save the Logger session normally;
- tell Claude when workout is complete.

Then wait for Founder response.

Post-workout audit:
- HealthKit Strength observation arrived automatically or via ordinary foreground catch-up;
- canonical Workout created exactly once;
- correct Logger session selected as the match candidate;
- match confidence/basis documented;
- no ambiguity/unsafe auto-link;
- no duplicate Training session;
- Logger details unchanged;
- Activity/Nutrition unchanged except their own normal automatic revisions;
- no screenshot evidence involved;
- no cardio workout accidentally brought into the Strength-only policy;
- no strategic/V3/Confidence/briefing leakage yet.

If candidate is safely matched but not confirmed, determine whether normal product behavior should require explicit Founder confirmation, or whether a reviewed deterministic confirmation policy is appropriate for future high-confidence Strength matches. Do not silently decide this without surfacing the product implication.

Part 5 — graduation decision

Return one of:

GREEN:
Strength normal prospective ingestion is working from Sep 23 with no manual canary/screenshot dependency. Keep Strength ingestion/matching live.

YELLOW:
Initial live Strength path works but a bounded issue must be resolved before calling it daily-driver ready. Keep or pause policy according to safety.

RED:
Unsafe duplicate/matching/data-authority behavior. Disable prospective Strength policy and preserve evidence.

Do NOT graduate cardio in this task.

Do NOT enable Workout strategic/V3 eligibility merely because ingestion works. After a clean live Strength acceptance, report whether a separate strategic-eligibility graduation slice is appropriate and what its gate should be (e.g. confirmed links only).

Testing/review if code changes:
- focused Workout automatic-ingestion tests;
- automatic vs manual identity namespace;
- background/foreground catch-up;
- matching ambiguity;
- duplicate prevention;
- Logger integrity;
- sourceRevision limitation/revision semantics;
- full Native suite if Native changes;
- relevant Server suites;
- mutation testing;
- fresh-context independent review exact candidate.

Authorization workflow:
For deploy, TestFlight upload, policy activation, or other privileged action requiring Founder authorization, ask the Founder directly in Claude chat, wait for approval, then continue. Do not publish a blocked handoff solely to request permission.

Final report:
- authority;
- whether automatic Strength ingestion existed already or needed code;
- sourceRevision disposition;
- exact prospective policy;
- whether screenshots/manual sync are no longer required;
- today’s live Strength result;
- canonical Workout/match result;
- Logger integrity;
- duplicate/ambiguity result;
- cardio exclusion;
- strategic eligibility state;
- exact next step for cardio canary and later Workout strategic graduation.

Flags:
SEP22_STRENGTH_ACCEPTED_STATE_INTACT
STRENGTH_AUTOMATIC_INGESTION_READY
STRENGTH_MANUAL_SYNC_REQUIRED
STRENGTH_SCREENSHOT_REQUIRED
WORKOUT_SOURCE_REVISION_SUPPORTED
STRENGTH_POLICY_EFFECTIVE_FROM_2026_09_23
STRENGTH_POLICY_OPEN_ENDED
HISTORICAL_WORKOUT_BACKFILL_ENABLED
CARDIO_INCLUDED_IN_STRENGTH_POLICY
FOUNDER_AUTHORIZED_STRENGTH_GRADUATION
TODAY_STRENGTH_OBSERVATION_RECEIVED
TODAY_STRENGTH_CANONICAL_CREATED
TODAY_STRENGTH_MATCHED_CORRECT_LOGGER_SESSION
TODAY_STRENGTH_AMBIGUOUS
TODAY_DUPLICATE_TRAINING_SESSION_PRESENT
TODAY_LOGGER_DETAIL_MUTATED
WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED
ACTIVITY_NUTRITION_UNCHANGED
STRENGTH_GRADUATION_VERDICT
READY_FOR_CARDIO_CANARY


FOUNDER TIMING CLARIFICATION — today's workout may precede rollout

Founder expects to start the normal 2026-09-23 strength workout within approximately one hour and should NOT delay the workout for this engineering task or a new Native build.

Required graduation semantics:
- eligibility is based on the workout's Founder-local occurrence date/time relative to the prospective policy effective date, NOT on whether PhysiqueOS happened to observe/upload it after activation;
- a qualifying Strength workout occurring on 2026-09-23 must be ingestible by normal automatic/foreground catch-up even if the workout completed before the new policy/build became live;
- a workout already in progress during rollout should be handled normally once Apple Health exposes/saves the completed HKWorkout; no mid-workout PhysiqueOS capture requirement;
- a workout completed earlier today before rollout must be discovered on the next eligible HealthKit catch-up after rollout;
- this same-day catch-up is NOT historical backfill and must not require Founder canary/manual Workout Sync;
- Sep 22 and older workouts must not be swept in merely because a catch-up query runs after rollout;
- do not require the Founder to postpone, restart, re-record, re-upload, or otherwise structure the workout around deployment timing.

Explicit acceptance case for today's first live Strength event:
Founder may start/finish the Sep 23 Workout Logger + Apple Watch Strength workout before engineering finishes. Once the prospective Strength capability/policy is live, ordinary app foreground/catch-up must discover the already-completed Sep 23 HKWorkout, canonicalize it exactly once, and reconcile it to the correct Sep 23 Logger session without screenshots or Founder canary/manual sync.

If the current Native automatic Workout query cannot discover an already-completed eligible same-day workout after rollout, treat that as a graduation blocker and fix/review it before declaring Strength live. Do not work around it by asking Founder to manually sync.

When notifying Founder that the live acceptance is ready, account for whether today's workout is then in progress or already completed and give only normal-use instructions.
