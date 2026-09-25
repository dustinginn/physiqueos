Task id: claude-training-aggregation-server-deploy-20260925

Continue in the existing persistent PhysiqueOS Training + Local Day Correctness Claude conversation. Reasoning: high.

Founder explicitly authorizes deployment of the exact reviewed Server candidate:
09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e
on branch claude/training-aggregation-server-20260925.

This task authorizes SERVER DEPLOYMENT + POSTDEPLOY READ-ONLY ACCEPTANCE ONLY.

Do NOT release Native c15f0881. Do NOT prepare/archive/upload Build 61. Tomorrow's prospective Cardio test must remain on unchanged Build 60.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/training-localday/latest.json
agent-handoffs/reports/20260925T233600Z-training-localday-diagnostic-and-contract.md
agent-handoffs/reports/20260925T233700Z-training-localday-candidate-implementation.md
agent-handoffs/reports/20260925T233800Z-training-localday-final-acceptance.md
agent-handoffs/performance/latest.json
HealthKit latest.json/latest.md only for protected Cardio authority; do not modify them.

Expected current authority, reverify:
Production Server afdc849a6399130668d846544e85236fe1974741
Production deployment c4d8484e-0bfa-4d07-9cf4-0cf591ac3ee2 ACTIVE
Native Build60 00321dcc6dd86a6479dbca5dd27e691c87348cd8
Workout policy v4 [cardio,strength]
Performance Native c736254b unreleased
Combined future Native c15f0881 unreleased

PREDEPLOY

Reverify:
- app/components and current ACTIVE deployment;
- production branch exactly afdc849a;
- 09f04dc5 clean fast-forward descendant;
- exact candidate clean/pushed;
- no migration/schema/infra drift;
- health/ready and migrations;
- current Training Day/History Sep21/22/23/24 baseline;
- HealthKit/Cardio policy/workout state;
- Activity totals, Strength links/claims and strategic digests;
- exact candidate webpack build authority.

Abort on unexpected authority/data drift.

DEPLOY

Use the established guarded PhysiqueOS two-step production procedure:
1. exact quoted fast-forward production ref update;
2. apps update --spec changing only PHYSIQUEOS_GIT_SHA and PHYSIQUEOS_BUILD_ID on web + worker;
3. create-deployment --force-rebuild.

No schema migration.
No Native change.
No production data mutation.

POSTDEPLOY AUTHORITY

Require:
- deployment ACTIVE;
- web/worker source_commit_hash exactly 09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e;
- runtime/log SHA and build id exact;
- live 200;
- ready healthy;
- migrations unchanged;
- no unexpected error logs.

POSTDEPLOY CORRECTNESS / TRAINING ACCEPTANCE

Using the same bounded read-only production-shaped probe:
- Sep21 Recent Training History remains 3;
- Sep22 remains 3, never 5;
- Sep23 becomes 3;
- Sep24 becomes 3;
- Training Day remains 3 on each of those days as previously accepted;
- latest Training day/history/Evidence Hub training summary reflects the unified presented-workout count;
- reporting history/overview session semantics match the reviewed contract;
- Native Training Library exercise payload remains unchanged;
- structured Strength performance/PR/exercise semantics unchanged;
- no HealthKit Strength duplicate session;
- Cardio rows create no Logger/link/claim semantics;
- generic historical walking and prospective canonicalType semantics unchanged.

PERFORMANCE PARITY

Re-run the affected Training landing/reporting/library benchmark against live 09f04dc5 using the same methodology.
Require:
- no common path >3s;
- Training landing/history preferred <=1–2s;
- Native Library payload remains small/unchanged;
- no regression toward multi-MB payloads;
- current Performance Phase 2 Server improvements from afdc849a preserved.

HEALTHKIT / STRATEGIC SAFETY

Prove postdeploy:
- workout policy still v4 [cardio,strength], quarantined/no backfill/no auto-confirm;
- canonical workouts/deferred state unchanged;
- isIndoorWorkout/prospective Cardio ingestion path unchanged;
- Sep23/Sep24 Activity totals unchanged;
- Strength links/claims unchanged;
- strategic digests unchanged;
- no historical briefing regeneration;
- no production data mutation.

LOCAL-DAY NOTE

The Server candidate includes backward-compatible optional device-timezone support for future Native Logged Today and weigh-in requests. Build60 sends no such zone, so current Build60 daily-driver behavior should remain exactly as before until Build61. Verify this backward compatibility. Do not claim the Native rollover fix is live.

GITHUB

Publish a timestamped Training/Local-Day Server deployment checkpoint to agent-handoffs/reports/ on main and update agent-handoffs/training-localday/latest.json.
Do NOT modify HealthKit latest.json/latest.md or performance/latest.json.

Include exact deployment id/SHA, Training Sep21-24 before/after, performance parity, correctness audit, HealthKit safety, and explicit statement:
- Build60 unchanged;
- Native c15f0881 unreleased;
- local-day Native behavior not live yet;
- Build61 still waits for prospective Cardio acceptance.

STOP after report.

NOT AUTHORIZED

No Build61 prep/archive/upload.
No TestFlight upload.
No production data mutation.
No HealthKit policy/reconciliation/strategic eligibility change.
No historical briefing regeneration.
No Founder-device operation.

Flags:
AUTHORITY_REVERIFIED
CLEAN_FAST_FORWARD_VERIFIED
PREDEPLOY_ZERO_WRITE_AUDIT_PASS
SERVER_DEPLOYED
WEB_WORKER_SOURCE_COMMIT_EXACT
RUNTIME_SHA_EXACT
HEALTH_LIVE_READY_PASS
MIGRATION_STATE_UNCHANGED
POSTDEPLOY_ZERO_WRITE_AUDIT_PASS
SEP21_HISTORY_THREE
SEP22_HISTORY_THREE_DEDUP
SEP23_HISTORY_THREE
SEP24_HISTORY_THREE
TRAINING_DAY_UNCHANGED
REPORTING_SEMANTICS_PASS
NATIVE_LIBRARY_UNCHANGED
TRAINING_PERFORMANCE_PARITY_PASS
PERFORMANCE_PHASE2_SERVER_GAINS_PRESERVED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
STRATEGIC_STATE_UNCHANGED
BUILD60_UNCHANGED
NATIVE_C15F0881_UNRELEASED
LOCALDAY_NATIVE_NOT_LIVE_YET
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
