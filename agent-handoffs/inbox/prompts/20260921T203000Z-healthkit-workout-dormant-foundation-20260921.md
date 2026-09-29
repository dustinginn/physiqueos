Task id: healthkit-workout-dormant-foundation-20260921

Goal

Build the dormant HealthKit Workout foundation now, while the Activity + Nutrition canonical proving period continues. Prepare strength-workout reconciliation/linking and cardio canonicalization architecture so Workout canary testing can begin immediately after Activity/Nutrition acceptance.

Do NOT activate production Workout canonicalization in this task.
Do NOT create HealthKit-derived strategic Evidence.
Do NOT change V3/Confidence/briefing behavior.
Do NOT interfere with the active 2026-09-21 Activity + Nutrition test-day policy.

Claude chat continuity

Continue in the existing Claude Remote Control chat named "HealthKit Phase 2".
Inbox metadata chat_preference must remain the valid enum continue_current_chat.

Authority

Reverify before editing.

Expected production Server:
a40c0b53c49240d5666d2a3475d48541cfd5f57e
deployment dda84642-c713-4091-a3a2-126e02345d3b
schema 000014

Expected Native:
2bfbf54ad105a3a18189e811f06afc421741a7da
Build 49

The current Activity + Nutrition test-day sync is GREEN at its first audit:
- exactly one canonical Activity day
- exactly one canonical Nutrition day
- revision/idempotency model correct
- strategic quarantine intact
Do not mutate those records/policy.

Architecture invariant

HealthKit workout observation
-> canonical Apple workout / telemetry record
-> reconciliation/link candidate to PhysiqueOS workout where appropriate
-> canonical PhysiqueOS Workout/Activity relationship
-> evidence eligibility separately
-> V3 only after later explicit Founder authorization.

Source ingestion must never silently become coaching evidence.

Authority model

Strength/resistance:
- Workout Logger remains authoritative for exercise identity, exercise order, sets, reps, load, execution variants, supersets and Logger-specific notes.
- HealthKit strength workouts MUST NOT manufacture exercises/sets/reps/load.
- HealthKit MUST NOT replace or supersede a legitimate Workout Logger session merely because times overlap.
- HealthKit may contribute Apple telemetry: workout type, start/end, duration, active energy, total energy if available, heart-rate summaries/series where contractually supported, source device/app, and other explicitly approved telemetry.
- The system should create a deterministic link candidate between an Apple strength workout and a Logger session when they likely represent the same physical workout.

Cardio:
- Apple HealthKit cardio workouts may be eligible to become canonical PhysiqueOS Workout/Activity records when no richer PhysiqueOS logger session is expected.
- Design the canonical path now, but keep production activation OFF.
- Map only workout types actually supported/proven by HealthKit and PhysiqueOS contracts.
- Preserve source workout identity and revisions.

First real Workout canary after this foundation

The intended first canary is a normal Founder strength workout:
1. Founder logs normally in Workout Logger.
2. Apple Watch records the strength workout.
3. HealthKit workout observation arrives.
4. System identifies the matching Logger session as a link candidate.
5. Telemetry can be attached/reconciled without changing Logger exercise/set authority.
6. No duplicate canonical workout.
7. V3/evidence eligibility remains OFF.

Do not run that production canary in this task.

Audit existing work first

Before implementation:
- inspect prior HealthKit workout foundation branches/commits/handoffs;
- inspect current production Server HealthKit code;
- inspect Build 49 Native HealthKit code and entitlements;
- inspect current canonical Training/Workout/Activity models and Workout Logger identity;
- inspect any existing Apple Health workout parsing/mapping/linking code;
- determine what can be reused versus what is stale/superseded.

Produce a concise map:
HKWorkout -> Native observation -> transport -> Server observation -> canonical workout/telemetry -> link candidate -> evidence eligibility.

Do not revive old branches wholesale. Reconcile relevant code onto current authorities.

Stable identity/revisions

Define and test:
- stable HealthKit workout observation identity
- source workout UUID/external identity handling without exposing private identifiers in reports
- revision semantics when Apple updates duration/calories/HR metadata
- identical replay = no duplicate/no-op
- later revision = same canonical Apple workout record advances
- deletion/retraction semantics if HealthKit reports a deleted workout, if supported by current observation contract
- timezone/effective-time authority from workout start/end, not ingestion timestamp

Strength link candidate

Design one deterministic Server-owned matcher.

Inputs may include:
- Founder owner
- local/effective date
- overlapping start/end windows
- duration
- workout family/type
- source
- existing Logger session telemetry
- existing explicit support binding if present

Do not use bare screenshot filenames or other historically unsafe identity shortcuts.

Matcher output must distinguish:
- confident_match
- possible_match / needs Founder confirmation
- no_match
- ambiguous_multiple

Do not automatically link ambiguous matches.

Define conservative thresholds from existing product semantics/tests rather than arbitrary broad matching.

Link relationship

Model the relationship without rewriting Logger content.

A linked strength pair should preserve:
- Logger canonical session id as training-content authority
- HealthKit workout canonical id as telemetry/source authority
- explicit relationship/link record or equivalent immutable/bounded association
- provenance for who/what created the link
- unlink/relink capability later without deleting either underlying record

Do not implement a Founder UI for manual confirmation unless already required by the current architecture. This task is foundation first.

Telemetry

Define the supported telemetry attachment contract:
- start/end
- duration
- active calories
- total calories if HealthKit provides it
- heart-rate summary fields already supported
- source device/app metadata
- workout type

Do not add raw high-volume heart-rate series storage unless it is already in the approved foundation and storage/cost is understood.

Activity interaction

Prevent double counting.

If a HealthKit workout contributes calories that are already included in Apple daily Move/active-energy totals:
- do not add workout calories on top of daily Activity expenditure.
- Workout telemetry is descriptive/attributive unless a canonical Activity calculation explicitly needs a non-overlapping component.

Test this explicitly.

Cardio design

Prepare mapping and canonicalization for common approved Apple cardio workout types already represented in PhysiqueOS.

At minimum audit support for:
- walking
- running
- cycling
- elliptical/stair/other cardio only if current contracts support them

For cardio:
- one HealthKit workout should map idempotently to one canonical workout.
- revisions update same record.
- source/effective time/date retained.
- do not create duplicates when the same workout also contributes to daily Activity.
- strategic evidence eligibility remains OFF.

Strategic quarantine

Hard requirement:
- Workout HealthKit observations/canonical records/link candidates are NOT strategic Evidence.
- V3 eligible Workout HealthKit = 0.
- Confidence unaffected.
- no briefing regeneration.
- no automatic Training performance events/PRs from HealthKit telemetry.
- no Training Library mutations.
- no Goal/strategy mutations.

Activation policy

Extend or design the current bounded HealthKit activation-policy model so Workout can later be activated independently.

For this task:
Workout canonicalization activation = OFF in production.

If code deployment is needed, deployment must be zero-write with Workout OFF.

Provide dry-run/proving mechanism for a future exact-window Workout canary.

Native

Determine whether Build 49 already reads HKWorkout samples needed for the future canary.

If Native changes are required only to establish dormant workout observation capability:
- implement narrowly;
- do not upload operational workout data unless Server policy remains validation-only/off;
- preserve HealthKit entitlements and usage strings unless legitimate new HealthKit types require them;
- do not create Build 50 automatically unless a device build is genuinely required for the next canary.

If Build 49 already has adequate workout observation plumbing, prefer no Native build.

Background delivery

Architecture may include background delivery hooks, but do not turn on production Workout background delivery yet unless it is already validation-only and harmless.

The first Workout canary may use an explicit/manual sync if that better isolates correctness.

Tests

Server:
- stable workout identity
- identical replay
- revision update
- timezone/date attribution
- strength logger confident match
- possible/ambiguous/no-match behavior
- no Logger content mutation
- link/unlink relationship invariants
- no duplicate canonical workout
- cardio canonicalization
- daily Activity no double-count
- strategic quarantine
- no Training performance-event creation
- Workout activation OFF by default
- current Activity/Nutrition test policy unaffected

Native if changed:
- HKWorkout mapping
- source identity
- telemetry mapping
- no fabricated exercise/set data
- permission behavior
- current Activity/Nutrition sync regression

Run relevant full Server comparison against pristine production base, V3/briefing regressions, HealthKit suites, Training regressions, lint/diff/build/migration/access gates.
Run full Native suite/build only if Native changes.

Independent review

Fresh-context review exact final candidate(s), challenging:
- Workout Logger authority
- false linking risk
- identity/revision semantics
- double counting
- cardio duplicates
- quarantine
- rollback/unlink
- privacy/storage
- activation remains OFF
- Activity/Nutrition current proving period unchanged

Deployment

If Server code changes are required and all gates/review pass, deploy is authorized provided:
- Workout activation remains OFF;
- code deployment is zero-write;
- Activity/Nutrition current policy and canonical days remain unchanged;
- no schema migration unless separately surfaced and justified.

Use established production process and stale-source forced-rebuild verification.

If Native changes are required, do not automatically ship a new TestFlight build unless necessary for the future canary. Report whether Build 50 is required and why.

Production verification

After any Server deploy:
- exact SHA web/worker/runtime
- live/ready 200
- zero-write audit
- Activity/Nutrition test-day state unchanged
- Workout canonical records created by deployment = 0
- Workout activation OFF
- V3 eligible Workout HealthKit = 0
- Training authority/events unchanged

Deliverable

At completion, give the exact next Workout canary procedure, ideally:
- Founder logs a normal strength session
- Apple Watch records it
- exact bounded Workout canary activation/window
- manual sync action if needed
- read-only audit proving candidate linkage
- whether Founder confirmation is required before actual link
- strategic quarantine remains OFF

Do not run the canary yet.

Backlog preserved

- complete-day Activity/Nutrition Sep 21 revision/audit
- display-only Log/Evidence projection for HealthKit canonical days
- HealthKit Activity/Nutrition background delivery and durable Native revision floor
- Workout Logger draft survival across termination/update
- Photo Briefing production tap-to-expand mismatch
- Coaching Updates delivery-time UI cleanup

GitHub protocol

Claim/complete through established inbox protocol.
Any terminal blocker requiring Founder action is a mandatory handoff publication point.

Report:
- existing workout foundation found
- architecture map
- Server/Native changes
- candidate SHA(s)
- tests/review
- deployment if any
- activation state
- zero-write proof
- Build 50 required YES/NO
- exact future Workout canary steps

Explicit flags:
WORKOUT_FOUNDATION_AUDITED
WORKOUT_LOGGER_REMAINS_CONTENT_AUTHORITY
HK_WORKOUT_STABLE_IDENTITY_DEFINED
HK_WORKOUT_REVISION_SEMANTICS_DEFINED
STRENGTH_LINK_CANDIDATE_MODEL_READY
AMBIGUOUS_MATCH_AUTO_LINK_DISABLED
CARDIO_CANONICALIZATION_MODEL_READY
WORKOUT_ACTIVITY_DOUBLE_COUNT_PREVENTED
HK_WORKOUT_V3_ELIGIBLE
HK_WORKOUT_CONFIDENCE_IMPACT
TRAINING_PERFORMANCE_EVENTS_FROM_HK_DISABLED
WORKOUT_PRODUCTION_ACTIVATION_ENABLED
ACTIVITY_NUTRITION_TESTDAY_UNCHANGED
SERVER_DEPLOYED_IF_REQUIRED
NATIVE_BUILD50_REQUIRED
READY_FOR_WORKOUT_CANARY_AFTER_ACTIVITY_NUTRITION_ACCEPTANCE
