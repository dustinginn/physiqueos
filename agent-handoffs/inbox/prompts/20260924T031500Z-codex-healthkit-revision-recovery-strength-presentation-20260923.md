Task id: codex-healthkit-revision-recovery-strength-presentation-20260923

Take the next implementation slice after Strength backend reconciliation GREEN: fix the Activity/Nutrition daily-revision 409 recovery defect first, safely repair Sep 23 Activity, then complete the user-facing Strength integration across Workout Detail, Activity, and Log. Do not begin Cardio yet.

Use the SAME Codex chat. Reasoning: High.

Read first:
agent-handoffs/reports/20260924T030200Z-strength-sep23-deterministic-confirmed-final-green.md
agent-handoffs/reports/20260924T012249Z-build55-activity-sync-409-loop-diagnostic.md
agent-handoffs/inbox/prompts/20260924T020600Z-claude-healthkit-revision-loop-fix-design-20260923.md

Note: the Claude revision-loop design prompt was staged but not executed because Claude became unavailable. Treat it as a specification request/background, not as completed findings beyond Claude's actual diagnostic report.

Reverify authority. Expected:
Production Server cb9d14f90ac6851bd7f3cb884b76cba98a3774ce
deployment 6c82ac17-00cd-41c0-ad06-5cdbf605ff1c
Native Build 56 de0d3829836dd2e84327d268d4682c97260260e6 installed.
Sep 23 Strength HealthKit<->Logger relationship is confirmed one-to-one under healthkit-strength-auto-confirm-v1.
Workout strategic eligibility remains OFF.
Global linkAutoConfirm remains OFF.
Cardio remains not graduated.

Founder-observed Build 56 product gaps, Sep 23:
1. Workout Detail for Sep 23 Strength still looks like a pure Logger workout. It shows Logger exercises/sets but no visible attached Apple Health/Apple Watch session or HealthKit telemetry/provenance.
2. Activity detail says 1 linked workout but shows Workout Calories = 0 cal and Non-workout Calories = 606 cal.
3. Log says only "Strength Training logged" with no indication that Apple Health is attached/reconciled.
4. Sep 23 Activity remains stale at 606 active calories due to the diagnosed daily revision collision loop, so distinguish projection defects from stale-source-data effects before patching.

Product expectation:
A confirmed HealthKit Strength relationship means one logical workout, not two.
Workout Logger remains authoritative for exercises, sets, reps, load, variants, supersets, notes.
HealthKit supplies session telemetry/provenance: Apple Health/Watch source, start/end/duration, workout energy/calories and other accepted telemetry where available.
Relevant product surfaces should visibly understand the confirmed relationship without duplicating the workout.

Desired UX:
Workout Detail: retain Logger detail and add a compact attached Apple Health/Apple Watch source/session section with useful available telemetry. Do not create a second workout.
Activity: linked workout calories should reflect the canonical linked HealthKit workout energy when available; daily active calories remain the whole-day total. Non-workout active calories should be derived consistently so workout energy is not double-counted. If source Activity data is stale, represent that honestly and verify again after repair.
Log: confirmed/reconciled Strength should show subtle provenance, e.g. "Strength Training · Apple Health" or equivalent, without another row/card.
Ambiguous reconciliation UX from Build 56 remains for genuinely ambiguous cases.

PART 1 — Activity/Nutrition 409 revision-loop reliability fix

Use Claude's completed diagnostic as evidence:
- Sep 23 Activity Server state froze at sourceRevision 50 / 18:35:26Z.
- Build 55/56 foreground and pull-to-refresh queried/uploaded, but Server returned HEALTHKIT_OBSERVATION_IDENTITY_COLLISION repeatedly.
- device reused an already-consumed per-day revision with newer content;
- abandon-on-rejection did not advance/rebase revision floor;
- Build 55 timeout/rerun fix worked; this is a distinct revision/cursor recovery defect;
- Nutrition shares the latent mechanism.

Audit before coding and confirm current Build 56 behavior.

Implement robust semantics, subject to fresh review:
Native:
- per-day/per-scope revision high-water that never regresses;
- identity-collision recovery must rebase/advance using authoritative Server expected-revision information, not retry poisoned revision forever;
- durably accepted upload -> local acknowledgement/persistence must cross an uncancellable/atomic durability boundary so cancellation cannot reopen accepted->acknowledged gap;
- locked-device/protected-data persistence failure must not quarantine/reset a healthy state file or lose revision floors;
- pull-to-refresh after recovery must create a genuinely fresh attempt;
- address the secondary queued-rerun/coalescing hazard if confirmed;
- Activity and Nutrition share safe daily-aggregate semantics;
- do not accidentally change Workout identity/revision semantics.

Server:
- return nextExpectedRevision or equivalent authoritative recovery metadata on relevant 409;
- collision warning logs include hashed identity + received revision + expected floor, no sensitive values;
- do NOT silently accept lower/reused revisions;
- preserve purpose mismatch and real identity-collision protections;
- improve observability/receipt semantics enough to diagnose recurrence.

Diagnostics:
Expose automatic-scope diagnostics on Founder diagnostics/canary surface if reasonably in scope: lastAttempt, lastSuccess, lastErrorCode, abandonedBatchCount, cursor/revision high-water generation, lastDurableAcknowledgement, scope/domain. Founder-only, not general user UI.

PART 2 — bounded Sep 23 Activity repair

After the reliability fix is reviewed/deployed/installed as needed, design and dry-run a bounded repair for Sep 23 Activity:
- re-query Apple Health Sep 23 daily aggregate from device if required;
- emit using a fresh authoritative revision after recovery;
- no fabricated totals;
- no historical backfill outside Sep 23;
- do not rewrite Sep 24+;
- determine whether Sep 23 Nutrition requires reconciliation/repair too;
- verify final Sep 23 Activity against Apple Health source available at repair time.
Any production/data mutation or special repair action requires separate Founder authorization after dry-run.
Do not ask Founder to use canary/manual sync as the permanent solution.

PART 3 — confirmed Strength projection/presentation integration

After separating stale Activity effects from actual read-model gaps, trace:
confirmed relationship -> canonical HealthKit workout -> Activity workout-energy attribution -> Training/Workout Detail read model -> Log summary read model -> Native presentation.

Workout Detail acceptance:
- one logical Strength workout;
- Logger exercises/sets/reps/load unchanged;
- compact attached Apple Health/Apple Watch provenance;
- display available HealthKit session telemetry such as start/end/duration/workout energy where canonical data supports it;
- no duplicate Training object/session;
- provenance clearly distinguishes Logger detail from HealthKit telemetry.

Activity acceptance:
- linked workout count correct;
- workout calories sourced from linked canonical HealthKit workout telemetry when available;
- whole-day active calories remain canonical daily Activity total;
- non-workout active calories = daily active calories minus included workout active energy using explicit safe semantics, floor at zero if needed and report anomalies rather than silently hiding them;
- no double counting;
- if multiple workouts later exist, aggregation is deterministic and deduplicated;
- cardio compatibility considered but do not graduate cardio in this task.

Log acceptance:
- confirmed Strength shows subtle HealthKit provenance, e.g. "Strength Training · Apple Health" or equivalent;
- no duplicate row;
- if relationship absent/unconfirmed, do not falsely claim Apple Health;
- ambiguous pending-review state remains distinct.

Strategic boundary:
Workout strategic/V3/Confidence/briefing eligibility remains OFF throughout this task.
Do not make confirmation/provenance/history strategic evidence.
Do not begin Cardio.

Testing:
Revision recovery:
- accepted upload then cancellation before acknowledge;
- reused revision with changed content -> 409 -> rebase -> fresh revision succeeds;
- revision never regresses across relaunch/app update;
- locked-device state I/O failure;
- foreground and pull-to-refresh;
- pull during in-flight/queued rerun;
- offline/reconnect;
- Activity/Nutrition independent;
- one bad scope cannot freeze others;
- identical replay idempotent;
- purpose mismatch still refuses;
- local date rollover;
- no Workout regression.
Mutation-test high-water/rebase/ack guards.

Strength presentation:
- confirmed relationship with workout energy;
- unconfirmed relationship;
- missing energy;
- daily total less than workout-energy anomaly;
- multiple linked workouts/dedupe;
- Logger byte-identical;
- no duplicate Training session;
- Log provenance only after confirmation;
- Workout Detail source/telemetry mapping;
- Sep 23 production-shaped fixture.

Run full relevant Server/Native suites and fresh-context independent adversarial review exact candidates.

Sequencing:
A. Reverify authority and audit.
B. Implement/review revision-loop fix.
C. Ask Founder before any Server deploy.
D. Ask Founder before any Native/TestFlight upload.
E. After fixed client/server live, prepare bounded Sep 23 Activity repair dry-run and ask separately before apply.
F. Implement/review Strength projection/presentation, batching into the same next Native build only if safe and reviewed; avoid unnecessary build churn.
G. Real-device acceptance.
H. Publish final handoff. Only after this reliability/product-integration slice is accepted should Cardio begin.

Standing GitHub checkpoint rule:
Publish a durable GitHub progress/checkpoint after EVERY substantive chunk, including authority, changes, tests/review, unresolved findings, authorization needed, exact next step. Do not work invisibly for hours.

Standing Native simulator/disk rule:
Founder uses iPhone 17 Pro. Retain/use only the iPhone 17 Pro simulator device. Do not create/download/retain other simulator devices for convenience. Do not delete the required iOS runtime. Before archives/builds check free space and clean unnecessary simulator/build artifacts in a targeted way; do not blindly delete unrelated archives, DerivedData, runtimes, or user data.

Queued work to preserve:
- Cardio immediately after this slice.
- Midweek Briefing forensic audit is staged at agent-handoffs/inbox/prompts/20260924T020500Z-claude-midweek-briefing-forensic-audit-20260923.md and can be executed by either coder later.
- Active workout Log-tab direct return.
- core-page performance;
- Training PR reliability;
- Photo PI;
- true Workout sourceRevision.

Flags:
AUTHORITY_REVERIFIED
REVISION_LOOP_ROOT_CAUSE_CONFIRMED
DAILY_REVISION_HIGH_WATER_FIXED
IDENTITY_COLLISION_REBASE_FIXED
DURABLE_ACK_CANCELLATION_GAP_FIXED
LOCKED_DEVICE_STATE_RESET_FIXED
PULL_TO_REFRESH_RECOVERY_FIXED
AN_REVISION_TESTS_PASS
SERVER_NEXT_EXPECTED_REVISION_IMPLEMENTED
FOUNDER_DIAGNOSTICS_EXPOSED
SEP23_ACTIVITY_REPAIR_DRYRUN_READY
SEP23_ACTIVITY_REPAIRED
SEP23_NUTRITION_REPAIR_NEEDED
STRENGTH_CONFIRMED_RELATIONSHIP_PRESENT
WORKOUT_DETAIL_HEALTHKIT_PROVENANCE_VISIBLE
WORKOUT_DETAIL_HEALTHKIT_TELEMETRY_VISIBLE
ACTIVITY_WORKOUT_CALORIES_CORRECT
ACTIVITY_NONWORKOUT_CALORIES_CORRECT
ACTIVITY_DOUBLE_COUNT_FREE
LOG_HEALTHKIT_PROVENANCE_VISIBLE
LOGGER_DETAIL_UNCHANGED
DUPLICATE_TRAINING_SESSION_PRESENT
WORKOUT_STRATEGIC_ELIGIBILITY_ENABLED
SERVER_FIX_REQUIRED
SERVER_DEPLOYED
NATIVE_BUILD_REQUIRED
NATIVE_BUILD_NUMBER
TESTFLIGHT_UPLOADED
READY_FOR_CARDIO
