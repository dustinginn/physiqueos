Task id: claude-healthkit-prospective-cardio-outdoor-walk-acceptance-20260926

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

Founder reports that on Sep 26 they have now recorded a NEW Outdoor Walk on Apple Watch specifically for the prospective Cardio acceptance gate.

This task authorizes READ-ONLY / OBSERVE / WAIT-FOR-NORMAL-SYNC / VERIFY / REPORT ONLY for this newly recorded prospective workout.

Do NOT manually ingest, reconcile, backfill, replay, edit, relabel, or otherwise cause the workout to appear. The purpose of this gate is to prove the untouched prospective automatic pipeline.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
latest HealthKit Cardio graduation/reconciliation/deployment reports
agent-handoffs/goal-v3/latest.json only for current production Server authority
agent-handoffs/training-localday/latest.json as relevant to current Training presentation.

Reverify current authority. Expected production Server is now:
2a23eee762472081815d9122b97c0f0a9f1b8969
deployment 14d52e0a-034b-4d9e-949e-b2602c29dbfc ACTIVE.
Native installed remains Build60 00321dcc6dd86a6479dbca5dd27e691c87348cd8.
Workout policy v4 [cardio,strength], strategic eligibility quarantined, historicalBackfill false, linkAutoConfirm false.
Do not blindly trust these values; reverify.

FOUNDER EVENT

A new Apple Watch Outdoor Walk was recorded on Sep26 in the Founder’s current local context.
Do not infer exact start/end/calories/HR/location from this prompt.
Discover the new observation from normal HealthKit sync/production records using bounded read-only inspection.
Do not use GPS/location data. Indoor/Outdoor fidelity must come only from HKMetadataKeyIndoorWorkout -> isIndoorWorkout -> canonicalType.

PRIMARY ACCEPTANCE QUESTION

Did the normal prospective path, without manual intervention, successfully perform:

Apple Watch / HealthKit
-> Native HealthKit observation
-> normal automatic sync
-> Server observation persistence
-> Cardio family classification
-> automatic canonical Cardio workout creation
-> specific canonicalType outdoor_walking
-> Training Day presentation as Outdoor Walk
-> Activity workout/non-workout accounting
while preserving all safety invariants?

WAITING / POLLING RULE

This is a normal-sync acceptance gate. If the workout is not yet present on first read:
- do not declare failure immediately;
- use only the established bounded observation/check mechanism already used by the HealthKit lane;
- wait/poll only within the existing safe cadence/time horizon used for acceptance;
- do not trigger manual sync from the Founder device;
- do not create/replay ingestion payloads;
- do not mutate anything.
If the normal expected sync horizon expires with no observation, report that as the failure point and stop.

PART A — IDENTIFY THE NEW OBSERVATION

Read-only:
- identify the newly arrived Sep26 HealthKit workout observation;
- prove it is new/prospective, not one of the historical reconciled walks;
- capture stable hashed identity only in reports, never raw HealthKit UUID;
- inspect stored source fields/provenance;
- prove isIndoorWorkout was received as false from the prospective transport;
- prove workout activity type is walking;
- capture start/end/duration/active energy/HR telemetry where present;
- verify no location/GPS field was needed/read.

If isIndoorWorkout is absent/null, STOP and report type-fidelity failure. Do not infer Outdoor from Founder statement, workout name, route, speed, or context.

PART B — AUTOMATIC CANONICALIZATION

Prove, with no manual reconciliation:
- observation family classified cardio;
- canonicalType = outdoor_walking;
- exactly one canonical Cardio workout created;
- canonical source identity/idempotency preserved;
- observation is not left in workout_canonicalization_deferred;
- no duplicate canonical workout;
- no Training Logger session created;
- no Strength relationship/link/claim created;
- no strategic evidence created;
- policy remains [cardio,strength].

Trace timestamps/order enough to prove this was normal automatic processing, not historical reconciliation.

PART C — TRAINING PRESENTATION

Using the live Server Training read path:
- Sep26 Training Day includes this workout;
- label/type = Outdoor Walk, not generic Walking;
- Cardio family presentation correct;
- start/end/duration/active energy/HR presentation fields reconcile to canonical workout;
- Cardio detail route resolves;
- no Logger exercise/set controls implied;
- Recent Training History/session count includes the workout according to the now-live unified Training aggregation semantics;
- if there are other Sep26 workouts, report the total/count without assuming this walk is the only one.

Do not require Founder-device screenshots for this read-only gate. After Server acceptance, tell Founder exactly what to verify on Build60.

PART D — ACTIVITY ACCOUNTING

Capture Sep26 canonical whole-day Activity before/after only if the pre-state is available from existing audit/history; otherwise verify current decomposition and invariants without inventing a baseline.

Prove:
- whole-day active calories are not increased by adding workout energy a second time;
- Outdoor Walk active energy is included exactly once in known workout energy;
- non-workout calories = max(daily active total - included known workout energy, 0) under current canonical rules;
- no negative non-workout calories;
- decomposition reconciles to whole-day total within rounding;
- exercise minutes/current Activity day remain coherent;
- no duplicate accounting from screenshot evidence/canonical workout.

If this day also contains screenshot-derived duplicate evidence, explicitly exercise coexistence/dedup semantics. Otherwise say not applicable.

PART E — INDOOR/OUTDOOR FIDELITY

This is the key prospective proof:
- source HKMetadataKeyIndoorWorkout=false
- wire isIndoorWorkout=false
- Server observation retains false
- classifier outputs outdoor_walking
- canonical workout canonicalType outdoor_walking
- Training presentation Outdoor Walk

Trace each hop with code/runtime evidence where available.

Also prove the absence of accidental fallback:
- no generic walking when metadata is present;
- no date/GPS/location heuristic;
- no Founder-provided label used as source truth.

PART F — SAFETY / REGRESSION

Verify read-only:
- historical Sep23/24 reconciled generic walks unchanged;
- Sep21/22 presentation/dedup unchanged;
- Strength workouts/links/claims unchanged;
- workout policy unchanged;
- strategic eligibility remains quarantined;
- historicalBackfill false;
- linkAutoConfirm false;
- no briefing/confidence/Goal strategic artifact generated from Cardio;
- current production Goal V3 deployment remains healthy;
- migrations unchanged;
- live/ready healthy.

PART G — CARDIO GRADUATION DECISION

If all prospective gates pass, mark prospective Cardio canonicalization/type-fidelity acceptance PASS.

Do NOT automatically unquarantine strategic evidence or expand policy further. Those are separate product decisions.

Explicitly distinguish:
- Cardio ingestion/canonicalization/type fidelity accepted;
- strategic eligibility still quarantined;
- any remaining presentation/accounting follow-ups.

If the Training History “3 sessions” work is already live, include the new Sep26 count verification.

PART H — GITHUB

Publish a timestamped HealthKit prospective-Cardio acceptance report under agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md according to the established HealthKit lane protocol.
Do not overwrite goal-v3/performance/training-localday pointers.

Include:
- hashed workout identity;
- normal sync timing;
- every type-fidelity hop;
- canonical workout facts;
- Training Day/History result;
- Activity decomposition;
- no duplicate/Logger/link/claim proof;
- strategic quarantine proof;
- historical controls;
- health/migrations;
- PASS/FAIL and exact remaining Cardio gates.

If PASS, recommended next step should note that the previously parked Native Build61 candidate efcb8574 can move to release preparation under separate Founder authorization, because this prospective Cardio gate was the blocker.

STOP after report.

NOT AUTHORIZED

No manual sync trigger.
No ingestion replay.
No reconciliation/backfill.
No production data mutation.
No workout-policy change.
No strategic eligibility change.
No Server deployment.
No Native Build61 prep/archive/upload.
No historical briefing regeneration.
No Founder-device operation.

Flags:
AUTHORITY_REVERIFIED
NEW_PROSPECTIVE_WORKOUT_IDENTIFIED
NORMAL_SYNC_PROVEN
HK_INDOOR_METADATA_FALSE_PROVEN
WIRE_IS_INDOOR_FALSE_PROVEN
SERVER_OBSERVATION_FALSE_PROVEN
CARDIO_CLASSIFICATION_PROVEN
OUTDOOR_WALKING_CANONICAL_TYPE_PROVEN
AUTOMATIC_CANONICALIZATION_PROVEN
NO_DEFERRED_STATE
ONE_CANONICAL_WORKOUT_ONLY
TRAINING_DAY_OUTDOOR_WALK_PRESENT
TRAINING_HISTORY_COUNT_CORRECT
ACTIVITY_DECOMPOSITION_PASS
NO_DOUBLE_COUNT_PASS
NO_CARDIO_LOGGER_LINK_CLAIM
HISTORICAL_CARDIO_CONTROLS_UNCHANGED
STRATEGIC_QUARANTINE_UNCHANGED
HEALTH_LIVE_READY_PASS
MIGRATION_STATE_UNCHANGED
PROSPECTIVE_CARDIO_ACCEPTANCE_PASS
SERVER_DEPLOYED
BUILD61_PREPARED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
