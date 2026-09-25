Task id: claude-healthkit-training-day-cardio-presentation-diagnostic-20260925

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

This task authorizes READ / DIAGNOSE / CODE / TEST / REVIEW ONLY to correct the remaining Cardio Training Day presentation defect discovered during Founder acceptance.

Do NOT mutate production data, reconcile anything further, change workout policy, activate strategic eligibility, deploy Server, archive/upload Native, or operate the Founder device.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/reports/20260925T161800Z-healthkit-cardio-historical-reconciliation-serial.md
the Build60 release/upload report and current Server deployment report.

FOUNDER ACCEPTANCE EVIDENCE / PRODUCT CONTRACT

The Founder supplied screenshots establishing the actual existing product behavior:

Known-good control — Training Day Sep21:
- Training Day shows two individual “Outdoor Walk” Cardio rows plus one “Traditional Strength Training” row.
- Header summarizes Quads · 1 strength session · 4 exercises · Walking · Cardio.
- Therefore canonical Cardio workouts DO belong in the Training Day read/presentation surface.
- This does NOT mean Cardio should create a structured Training Logger session, Strength link, or claim. Training Day is a unified workout presentation surface; Logger session semantics remain distinct.

Current defect — Training Day Sep23/Sep24 after successful historical reconciliation:
- Sep23 Training Day shows only Traditional Strength Training; the two newly reconciled Cardio walks are missing.
- Sep24 Training Day shows only Traditional Strength Training; the two newly reconciled Cardio walks are missing.

Activity Day Sep24:
- Activity accounting correctly shows ~915 active cal, 346 workout cal, 569 non-workout cal.
- This matches the Server post-reconciliation decomposition.
- Activity Day has historically been an accounting summary and does NOT need individual workout rows. Do not redesign Activity Day.

Server reconciliation state is already accepted:
- four canonical Cardio walking workouts exist;
- whole-day Activity totals unchanged;
- workout/non-workout accounting correct;
- no Cardio Logger/link/claim;
- policy remains [cardio,strength], quarantined.

Goal:
Find and fix why existing/canary Cardio workouts (Sep21/Sep22 known-good presentation path) appear in Training Day while the four newly reconciled Sep23/24 canonical Cardio workouts do not.

PART A — READ-ONLY PRODUCTION FORENSIC COMPARISON

Use established guarded read-only production procedure.

Compare at least:
- a known-good Sep21 Cardio workout that appears in Training Day;
- the Sep22 canonical Cardio canary records if relevant;
- each newly reconciled Sep23/24 Cardio workout.

Trace all fields consumed by the Training Day Server read model and Native DTO/view.

Compare:
- canonical workout schema/version;
- family;
- canonicalType;
- source/provider;
- source observation identity;
- localDate/timezone;
- start/end/duration;
- telemetry;
- reconciliation/coexistence state;
- quarantine/strategic fields;
- any presentation eligibility flag;
- any canonical source subtype;
- any ingestion/canonicalization provenance;
- any fields used for Training Day filtering/grouping/sorting;
- record id conventions;
- revision/status;
- linkage fields;
- any “auto canonicalized” vs “reconciled” distinction.

Do not assume the defect is data. Trace the live Server read path and Native read/presentation path end-to-end.

PART B — PROVE ROOT CAUSE

Determine exactly where the four records disappear:
1. canonical storage -> Server Training Day query/filter;
2. Server projection/read-model;
3. API serialization;
4. Native decoding;
5. Native grouping/filtering;
6. Native rendering/cache.

Use the Sep21 known-good record as a control through the SAME code path.

If possible, run the actual production presentation function/read-model against sanitized production-shaped fixtures for Sep21 and Sep23/24.

Root cause must be demonstrated, not inferred.

PART C — PRODUCT SEMANTICS TO PRESERVE

Correct intended behavior:
- Training Day is a unified presentation of workouts for that day.
- Canonical Cardio workouts appear as Cardio rows even without a Logger session.
- Structured Strength remains backed by its Training Logger session/details.
- Cardio does NOT gain Logger exercises/sets, Strength link, claim, or auto-confirm semantics merely because it is shown in Training Day.
- Activity Day remains the daily accounting surface; do not add individual workout rows there.
- historical Sep23/24 walks remain generic Walking/Cardio because isIndoorWorkout was not retained.
- prospective workouts with isIndoorWorkout should show specific Indoor/Outdoor type.
- sorting should be deterministic/chronological and match established Sep21 behavior.
- Training Day header summary should include Cardio family/type as established.
- tapping a Cardio row should use the existing Cardio workout detail presentation, not Strength detail/Logger semantics.

PART D — IMPLEMENT MINIMAL CORRECT FIX

Fix at the earliest correct layer.

Prefer correcting shared Server read/projection semantics if the canonical records are valid and the Server excludes reconciled Cardio.
Prefer Native correction only if Server already returns the correct rows and Native drops them.

Do not mutate historical production records merely to satisfy a presentation filter if those records are already canonically valid. The fix should make future reconciled and prospective Cardio follow the same product path automatically.

If both Server and Native need changes, isolate them clearly and preserve current combined authority:
Server base must include deployed e88b8ef7.
Native base must include Build60 release source 00321dcc / reviewed 2374e11a behavior.

No schema migration unless genuinely unavoidable; stop if one appears necessary.

PART E — REGRESSION TESTS

At minimum:
- Sep21 known-good shape still presents two Cardio + one Strength.
- Sep23 shape presents two generic Walking/Cardio + Strength.
- Sep24 shape presents two generic Walking/Cardio + Strength.
- generic historical walking stays generic; no fabricated Indoor/Outdoor.
- prospective indoor walking -> Indoor Walk.
- prospective outdoor walking -> Outdoor Walk.
- Cardio row requires no Logger session/link/claim.
- Cardio does not become a Logger session.
- Strength detail semantics unchanged.
- Training Day header includes Cardio family/type.
- Activity Day accounting/presentation contract unchanged.
- deterministic ordering.
- duplicate canonical identity suppressed if applicable.
- decode tests use real JSON when Native transport is involved.

PART F — VALIDATION / REVIEW

Run focused affected suites.
If Server changes:
- relevant broader Server tests;
- production webpack build on exact candidate;
- fresh-context adversarial review.
If Native changes:
- focused tests;
- determine whether full Native suite is warranted based on executable-source impact;
- obey STANDING_DISK_SAFETY.md before heavy operations;
- fresh-context adversarial review exact candidate.

Mutation-test the key filter/eligibility guard if practical: the test must fail if reconciled Cardio is excluded again.

PART G — RELEASE PLAN, NOT RELEASE

Publish exact candidate SHA(s), required deployment/build implications, and recommended shortest release path.

If Server-only:
- prepare reviewed Server candidate and stop for deployment authorization.
If Native-only:
- prepare reviewed Native candidate and explain whether Build61 is required.
If both:
- prepare both and give Server-first/Native sequencing.

Do NOT deploy/upload in this task.

GITHUB

Publish a timestamped HealthKit diagnostic/fix report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md.
Explicitly correct the prior acceptance assumption: historical reconciliation/accounting passed, but Founder Training Day presentation acceptance failed because reconciled Cardio rows were missing.

Include the Founder-observed control:
Sep21 Training Day already shows Cardio alongside Strength; Activity Day is accounting-only.

STOP for Founder release authorization after exact reviewed candidate(s) exist.

NOT AUTHORIZED

No production data mutation.
No further reconciliation.
No workout-policy change.
No strategic eligibility change.
No Server deployment.
No Native archive/upload.
No Founder-device operation.
No Activity Day redesign.
No fabricated Indoor/Outdoor metadata.

Flags:
AUTHORITY_REVERIFIED
SEP21_TRAINING_DAY_CONTROL_TRACED
SEP23_24_MISSING_CARDIO_REPRODUCED
ROOT_CAUSE_PROVEN
CANONICAL_DATA_VALID_OR_DEFECT_IDENTIFIED
TRAINING_DAY_UNIFIED_WORKOUT_CONTRACT_PRESERVED
ACTIVITY_DAY_ACCOUNTING_CONTRACT_PRESERVED
MINIMAL_FIX_IMPLEMENTED
HISTORICAL_GENERIC_WALKING_PRESERVED
PROSPECTIVE_INDOOR_OUTDOOR_PRESERVED
NO_CARDIO_LOGGER_LINK_CLAIM
FOCUSED_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS
NATIVE_TESTS_PASS_OR_NOT_APPLICABLE
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
