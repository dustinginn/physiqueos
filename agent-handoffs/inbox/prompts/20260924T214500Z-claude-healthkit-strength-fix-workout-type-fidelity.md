Task id: claude-healthkit-strength-fix-workout-type-fidelity-20260924

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

Read first:
agent-handoffs/reports/20260925T012000Z-healthkit-build59-strength-detail-diagnostic.md
agent-handoffs/latest.json
agent-handoffs/latest.md

Founder correction to the Cardio inventory:
- Sep 23, 2026 has TWO OUTDOOR WALK workouts surrounding the Strength workout.
- Sep 24, 2026 has TWO INDOOR WALK workouts surrounding the Strength workout.
The earlier shorthand describing all four as Indoor Walks is incorrect.

Product invariant:
PhysiqueOS HealthKit ingestion/canonicalization/reconciliation must preserve the specific workout type supplied by Apple Health / Apple Watch. “cardio” is an internal workout family/classification and must never erase, replace, or infer away the source workout type. Outdoor Walk must remain Outdoor Walk; Indoor Walk must remain Indoor Walk. This applies prospectively to all supported Apple Health workout types, not just these four observations.

This task authorizes CODE / TEST / REVIEW ONLY for the proven Build59 Strength Native decode defect, plus a read-only audit and tests for workout-type fidelity. It does NOT authorize TestFlight upload, Cardio activation, policy mutation, deferred-workout reconciliation in production, or production data mutation.

PART A — fix the proven Sep24 Training Detail decode defect

Implement the smallest Native correction proven by the diagnostic:
- HealthKitWorkoutAttachmentReadModel.Relationship.confirmedAt must support the correct unconfirmed-candidate response shape.
- Decode the appropriate optional candidate relationship fields such as matchOutcome/confidence exactly as the Server contract provides them.
- Preserve confirmed Sep23 decoding.
- Do not invent confirmation for Sep24.
- Do not change Server relationship semantics.
- Do not mutate the frozen Logger evidence package.
- Desired Sep24 Training Detail: existing Logger exercises/sets plus discrete Apple Health Strength telemetry (~11:22–11:50, ~28 min, 206 active cal, HR120) with honest candidate/confirmed relationship semantics.
- Generic “This session could not be loaded” must not occur for a valid candidate relationship payload.

Add real JSON decode fixtures/tests for BOTH:
1. confirmed relationship response (Sep23 shape);
2. candidate relationship response with no confirmedAt (Sep24 shape).
Do not rely only on hand-constructed Swift structs.

PART B — re-audit exact deferred Cardio identities and workout-type fidelity

Read-only production audit. Enumerate the four deferred family_not_in_activation_scope cardio observations with exact:
- observation/source identity;
- local date;
- Apple Health workout activity/type value as received;
- normalized canonical workout type that WOULD be produced;
- internal family classification;
- start/end/duration;
- active energy;
- source/device provenance;
- current defer state.

Acceptance expectation:
Sep23 #1 = Outdoor Walk.
Sep23 #2 = Outdoor Walk.
Sep24 #1 = Indoor Walk.
Sep24 #2 = Indoor Walk.
If production evidence disagrees, do not overwrite facts to match this expectation. Stop and report the exact source payload/type evidence and identify whether ingestion mapping is already wrong.

Trace the type pipeline:
HealthKit HKWorkout activity type -> Native payload/source representation -> Server normalization/classifier -> canonical workout type/display label -> Activity Detail contributing-workout presentation.

Prove whether specific type is preserved today. If a code path collapses specific types into generic cardio/walking, identify the exact layer and include the smallest correction in this candidate only if it is code-only and does not require production mutation. If the current pipeline already preserves exact types, do not change it; add regression tests.

Required invariant tests:
- outdoor walking source type -> family cardio AND canonical/display type Outdoor Walk;
- indoor walking source type -> family cardio AND canonical/display type Indoor Walk;
- outdoor and indoor remain distinct even when all other telemetry is similar;
- family classification never overwrites source workout type;
- deferred reconciliation constructor preserves the exact source workout type;
- Activity Detail contributingWorkouts exposes the specific type, not merely “Cardio”;
- no Indoor/Outdoor inference from GPS, location, speed, adjacent workouts, or date; source activity type is authoritative;
- unknown/new supported HealthKit workout type must not silently become another known type.

PART C — future Cardio reconciliation ledger

Update the planned bounded reconciliation ledger so the eventual Cardio apply gate explicitly names all four deferred identities and their expected specific types:
Sep23 Outdoor Walk x2
Sep24 Indoor Walk x2

Do not execute reconciliation now.

Also preserve the prior diagnostic finding that three Sep22 already-canonicalized workouts predate the current policy window; audit their exact workout types for consistency but do not include them in the four-item deferred apply set unless evidence proves they are actually deferred.

TEST / REVIEW

Run focused Native decoding tests and relevant HealthKit workout/type tests.
Run the relevant full Native suite on the existing iPhone 17 Pro simulator only.
If any Server code changes are necessary for type fidelity, run directly affected Server suites and real production-shaped webpack build.
Fresh-context independent adversarial review of the exact final candidate(s).

Concurrency:
Build59 combined Native release is a269700b on the Midweek branch. HealthKit may inspect that exact source but do not modify the Midweek worktree. Implement the Native fix in the HealthKit lane by reconciling onto exact Build59 authority in an isolated HealthKit worktree/branch, preserving Midweek changes byte-for-byte. Do not overwrite the Midweek lane.
Midweek Claude is separately auditing V3 engine quality. Do not touch its worktree.

At completion:
Publish a timestamped HealthKit report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md.
Include exact final Native candidate SHA, whether Server changes were needed, tests, fresh-review verdict, exact four-item Cardio ledger with specific workout types, and recommended release sequencing.
Stop before archive/TestFlight upload or any policy/data mutation.

Flags:
AUTHORITY_REVERIFIED
BUILD59_BASE_PRESERVED
SEP24_CANDIDATE_RELATIONSHIP_DECODE_FIXED
CONFIRMED_RELATIONSHIP_DECODE_PASS
CANDIDATE_RELATIONSHIP_DECODE_PASS
SEP23_TRAINING_DETAIL_REGRESSION_PASS
SEP24_TRAINING_DETAIL_FIX_PASS
WORKOUT_TYPE_PIPELINE_AUDITED
SEP23_OUTDOOR_WALK_1_PROVEN
SEP23_OUTDOOR_WALK_2_PROVEN
SEP24_INDOOR_WALK_1_PROVEN
SEP24_INDOOR_WALK_2_PROVEN
CARDIO_FAMILY_DOES_NOT_ERASE_TYPE_PASS
DEFERRED_RECONCILIATION_TYPE_FIDELITY_PASS
ACTIVITY_DETAIL_SPECIFIC_TYPE_PASS
FOUR_ITEM_CARDIO_LEDGER_READY
NATIVE_TESTS_PASS
SERVER_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
FRESH_CONTEXT_REVIEWED
TESTFLIGHT_UPLOADED
POLICY_MUTATED
CARDIO_ACTIVATED
DEFERRED_CARDIO_RECONCILED
PRODUCTION_DATA_MUTATED
GH_REPORT_PUBLISHED
