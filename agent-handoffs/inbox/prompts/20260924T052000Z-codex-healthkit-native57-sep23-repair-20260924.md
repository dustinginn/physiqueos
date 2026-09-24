Task id: codex-healthkit-native57-sep23-repair-20260924

Continue the active HealthKit reliability + Strength presentation rollout after the reviewed Server deployment. It is now September 24 in the Founder's current Texas local time. Treat September 23 and September 24 as distinct explicit calendar dates throughout this task; do not use yesterday/today language in reports where ambiguity is possible.

Use the SAME HealthKit Codex A chat. Reasoning: High.

Read first:
agent-handoffs/reports/20260924T050633Z-healthkit-revision-recovery-server-deployed.md
agent-handoffs/reports/20260924T044000Z-healthkit-revision-strength-presentation-reviewed-green.md
agent-handoffs/reports/20260924T012249Z-build55-activity-sync-409-loop-diagnostic.md

Reverify authority. Expected current production:
Server 63395579ed70611be8a57f032133a43a3bc67800
deployment 117d8a2f-8cc1-4ef1-9247-1029c875e401
build physiqueos-63395579-20260924
Native installed Build 56 de0d3829836dd2e84327d268d4682c97260260e6
Reviewed Native candidate e0ed02be57fef76b237be3fe4621f946a02ab40c
Do not trust hints without verification.

Critical calendar boundary:
Founder is now physically in Texas and local date is September 24.
The September 23 Activity day was poisoned/frozen under the old client revision behavior and remains incomplete. Do NOT treat apparent September 24 recovery as repairing September 23.
September 24 is a new per-day revision namespace and is valuable as a clean live acceptance day.
Preserve both goals:
A. prove September 24 Activity/Nutrition normal automatic sync works under the fixed Server + fixed Native;
B. separately reconcile/repair September 23 Activity using a bounded explicit procedure.

Current Server state from deployment audit:
Sep 23 Activity remains revision/sourceRevision 50, 49 history entries, partial-day, quarantined.
Sep 23 Nutrition remains revision/sourceRevision 4, 3 history entries, partial-day, quarantined.
No Sep 23 repair has occurred.
Strength confirmed relationship remains intact.
Workout strategic eligibility remains OFF.
Cardio not started.

PART 1 — Native Build 57 release

Take exact reviewed Native candidate e0ed02be57fef76b237be3fe4621f946a02ab40c and prepare the next sequential Native build after installed Build 56: Build 57, unless authority inspection proves a different next number is required.

This reviewed Native candidate contains:
- daily Activity/Nutrition revision high-water/recovery behavior;
- accepted-upload -> durable local acknowledgement protection;
- protected/locked-device persistence hardening;
- pull-to-refresh recovery semantics;
- Founder automatic-scope diagnostics;
- confirmed Strength Workout Detail Apple Health/Watch attachment;
- Activity linked-workout energy attribution/no-double-count presentation;
- Log Apple Health provenance.

Do not modify reviewed behavior merely to bump the build. Verify exact source lineage and build-number-only delta as appropriate.

Archive locally and run the guarded TestFlight upload dry-run.
STOP and ask Founder for explicit authorization before actual TestFlight upload.
Report exact Build number, archive identity, source SHA, and WOULD UPLOAD verdict.

PART 2 — September 24 clean-day acceptance plan

After Build 57 is actually authorized/uploaded/installed, use September 24 as the clean-day live validation:
- no Founder canary;
- no manual test-day sync;
- normal foreground/background behavior;
- Log pull-to-refresh when needed;
- verify Activity can advance multiple times during Sep 24 without identity-collision loop;
- verify Nutrition can advance independently when new nutrition data arrives;
- one stream must not freeze another;
- automatic-scope diagnostics should show healthy attempts/acknowledgements and monotonic revision floors;
- force-quit must NOT be required for freshness.

Do not claim September 24 acceptance before the fixed Native build is installed and observed.

PART 3 — bounded September 23 Activity reconciliation/repair

This is separate from Sep 24 clean-day sync.

Design and prepare a bounded repair for September 23 only after fixed Server and fixed Native are live:
- re-query the actual Apple Health September 23 daily aggregate from the device using the normal trusted HealthKit source;
- use the new authoritative revision-recovery semantics to emit a fresh valid revision for Sep 23;
- no fabricated total;
- no copying Sep 24 values backward;
- no historical sweep/backfill outside Sep 23;
- no rewriting Sep 24+;
- preserve provenance and quarantine/strategic boundaries;
- verify the final Sep 23 canonical Activity day reflects the Apple Health Sep 23 aggregate available at repair time;
- verify history/revision monotonicity and no duplicate canonical day;
- verify strategic collections/digests remain unchanged.

Determine separately whether Sep 23 Nutrition actually requires repair. Do not mutate it merely for symmetry.

Before ANY Sep 23 repair mutation/device repair action:
1. perform/read a bounded dry-run or equivalent exact repair plan;
2. report current Sep 23 Server facts and expected mutation;
3. ask Founder for separate explicit authorization.
Do not silently repair Sep 23 as a side effect of Build 57 installation.

PART 4 — Strength presentation acceptance

After Build 57 install, Founder should be able to verify:
Workout Detail:
- still one Logger workout;
- Logger exercises/sets/reps/load unchanged;
- attached Apple Health/Apple Watch session visible;
- available HealthKit start/end/duration/workout energy/telemetry visible as designed;
- no duplicate workout.

Activity Sep 23 after repair:
- linked workout count correct;
- Workout Calories reflect linked canonical HealthKit workout energy when available;
- Non-workout Calories derived from whole-day active calories minus included linked workout energy;
- no double counting;
- stale/incomplete data never masquerades as zero if energy is missing.

Log:
- confirmed Sep 23 Strength row shows subtle Apple Health provenance, e.g. Strength Training · Apple Health;
- no duplicate row.

Strategic boundary:
Workout strategic/V3/Confidence/briefing eligibility stays OFF.
Global linkAutoConfirm stays OFF.
Cardio stays blocked until this entire reliability + repair + presentation acceptance is complete.

Standing GitHub publication rule — REQUIRED:
A substantive chunk is NOT complete until its durable report is committed to GitHub main.
After EVERY substantive chunk publish a timestamped report under agent-handoffs/reports/ to main BEFORE telling Founder the chunk is done.
Every review/deploy/upload/dry-run/repair/acceptance response in chat must include the GitHub report commit SHA and report path.
Primary HealthKit lane must also update agent-handoffs/latest.json and latest.md to the current authoritative state.
If GitHub publication fails, explicitly say REPORT NOT PUBLISHED and do not represent the chunk as complete.
Do not say publication will happen later.
Secondary/parallel tasks may publish reports without overwriting latest.json; this task is the primary HealthKit lane and should update latest.

Standing Native simulator/disk rule:
Use/retain only iPhone 17 Pro simulator. Do not create/download/retain other simulator devices. Do not delete required iOS runtime. Check free disk before archive/build and use targeted cleanup only.

Authorization gates:
Server is already deployed; do not redeploy without a new reason/authorization.
Ask separately before TestFlight upload.
Ask separately before Sep 23 repair mutation/action.
Do not change policies, strategic eligibility, confirmed Strength relationship, or Cardio without separate authorization.

Exact immediate next step:
Reverify authority, prepare exact reviewed Native e0ed02be as Build 57, run release/archive + guarded upload dry-run, publish the checkpoint to GitHub main, and ask Founder for TestFlight upload authorization. Do not repair Sep 23 yet.

Flags:
AUTHORITY_REVERIFIED
LOCAL_DATE_SEP24_ACKNOWLEDGED
SEP23_REMAINS_INCOMPLETE
SEP24_NEW_NAMESPACE_PRESERVED
NATIVE_SOURCE_EXACT
BUILD57_PREPARED
BUILD57_ARCHIVED
UPLOAD_DRYRUN_WOULD_UPLOAD
BUILD57_UPLOADED
BUILD57_APPLE_VALID
SEP24_ACTIVITY_MULTIPLE_ADVANCES_PASS
SEP24_NUTRITION_ADVANCE_PASS
SEP24_NO_409_LOOP
SEP24_FORCE_QUIT_NOT_REQUIRED
SEP23_REPAIR_PLAN_READY
SEP23_REPAIR_DRYRUN_READY
SEP23_REPAIR_AUTHORIZED
SEP23_ACTIVITY_REPAIRED
SEP23_FINAL_TOTAL_SOURCE_VERIFIED
SEP23_NUTRITION_REPAIR_NEEDED
WORKOUT_DETAIL_HEALTHKIT_PROVENANCE_VISIBLE
ACTIVITY_WORKOUT_CALORIES_CORRECT
LOG_HEALTHKIT_PROVENANCE_VISIBLE
WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED
READY_FOR_CARDIO
GH_REPORT_PUBLISHED
