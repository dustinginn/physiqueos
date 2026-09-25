Task id: claude-performance-phase2-server-deploy-20260925

Continue in the existing persistent PhysiqueOS Performance Phase 2 Claude conversation. Reasoning: high.

Founder explicitly authorizes DEPLOYMENT of the exact reviewed Performance Phase 2 Server candidate:
afdc849a6399130668d846544e85236fe1974741
on branch claude/performance-phase2-server-20260925.

This task authorizes Server deployment + post-deploy performance/correctness verification ONLY.

Do NOT release Native candidate c736254b. Do NOT prepare/archive/upload Build 61. Tomorrow's prospective HealthKit Cardio acceptance must remain on unchanged Build 60.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/performance/latest.json
agent-handoffs/reports/20260925T185500Z-native-daily-driver-performance-phase2-baseline.md
agent-handoffs/reports/20260925T193500Z-native-daily-driver-performance-phase2-candidates.md
agent-handoffs/reports/20260925T194500Z-native-daily-driver-performance-phase2-acceptance.md
HealthKit latest.json/latest.md only for current production authority and protected Cardio state; do not take ownership of them.

Expected current production authority, reverify:
Server a399916ac9b1c9128067f0f77fb7fd05666aa92a
Deployment 66ee39f6-c4d7-49c8-9012-3de1a77a832c ACTIVE
Native Build60 release SHA 00321dcc6dd86a6479dbca5dd27e691c87348cd8
Workout policy v4 [cardio,strength]
Cardio historical reconciliation complete
Prospective Indoor/Outdoor Cardio acceptance pending first new workout.

PREDEPLOY

1. Reverify exact production app/components, ACTIVE deployment, no pending/in-progress deploy, health/ready.
2. Reverify production branch head exactly a399916a and candidate afdc849a is a clean fast-forward descendant.
3. Reverify candidate worktree/branch clean and exact reviewed SHA.
4. Reverify exact candidate production webpack build status; rerun only if needed to prove exact current candidate.
5. Run bounded zero-write predeploy correctness audit sufficient to protect:
   - workout policy v4 [cardio,strength];
   - Cardio canonical workout state/deferred backlog;
   - HealthKit type-fidelity code/state;
   - Sep23/Sep24 Activity totals;
   - Training Day Cardio presentation semantics now live from a399916a;
   - Strength links/claims;
   - strategic digests;
   - migration state.
6. Capture the same performance benchmark inputs/clock/methodology used in the final Phase 2 report so post-deploy comparison is apples-to-apples.
7. Abort on unexpected authority/data drift.

DEPLOY

Use the established guarded PhysiqueOS two-step DigitalOcean production deployment procedure:
- exact quoted refspec / clean fast-forward production branch update;
- apps update --spec changing PHYSIQUEOS_GIT_SHA and PHYSIQUEOS_BUILD_ID on BOTH web and worker and no unrelated spec field;
- create-deployment --force-rebuild.

No schema migration expected.
No Native change.
No production data write.

POSTDEPLOY AUTHORITY / HEALTH

Require:
- deployment ACTIVE;
- web + worker source_commit_hash exactly afdc849a6399130668d846544e85236fe1974741;
- runtime/log gitSha and buildId exact;
- live 200;
- ready healthy/no failing checks;
- migration state unchanged;
- no unexpected error logs.

POSTDEPLOY CORRECTNESS AUDIT

Using bounded read-only production checks, prove:
- workout policy remains v4 [cardio,strength], quarantine/backfill/auto-confirm unchanged;
- Cardio canonical workouts/deferred backlog unchanged;
- prospective Cardio ingestion/classifier/isIndoorWorkout path remains present and unchanged;
- Training Day Sep21/22/23/24 semantics from a399916a remain correct;
- Sep23/Sep24 Activity totals unchanged;
- Strength links/claims unchanged;
- strategic digests unchanged;
- no historical briefing regeneration;
- no production data mutation.

PERFORMANCE POSTDEPLOY ACCEPTANCE

Run the SAME zero-write benchmark against LIVE afdc849a with the same pinned clock/methodology from the final acceptance report.

At minimum capture live:
- Home warm/cold and compute;
- Training Logger warm/cold and compute;
- Progress Photos;
- Training landing response bytes + latency;
- Training Library response bytes + latency;
- Nutrition response bytes + latency;
- Evidence Hub aggregate download estimate;
- Log/Goals and other common controls sufficient to detect regressions.

Compare against:
baseline a399916a
candidate predeploy afdc849a
live postdeploy afdc849a

Require:
- projection payload sizes match candidate expectations;
- no decoder-contract field accidentally removed;
- non-projected parity digests remain identical;
- no common Server-backed daily-driver path >3s in the comparable benchmark absent clearly documented transient DB/network noise;
- if shared-production DB noise produces an outlier, repeat using the established interleaved methodology and report median/compute separately rather than hiding it.

Do not claim Native-only improvements are live yet. Explicitly separate:
LIVE NOW from Server:
- Home CPU/read improvement;
- Training Logger normalization improvement;
- Progress Photos formatting improvement;
- smaller Training landing/library/Nutrition/Evidence Hub payloads.
NOT LIVE until Build61:
- persisted last-known Home instant paint;
- Priority Detail acknowledge-first ordering;
- retained 19 screen view models;
- visible-only foreground refresh.

GITHUB

Publish a timestamped Performance Phase 2 Server deployment checkpoint to agent-handoffs/reports/ on main and update agent-handoffs/performance/latest.json.
Do NOT modify HealthKit latest.json/latest.md.

Include:
- exact deployment id;
- exact live SHA/build id;
- pre/post correctness audit;
- live performance before/candidate/live table;
- payload sizes;
- health/migration state;
- explicit HealthKit/Cardio path unchanged;
- explicit Native Build60 unchanged and c736254b still unreleased;
- recommended next step: wait for tomorrow's prospective Cardio acceptance, then consider Build61 release prep.

STOP after report for Founder direction.

NOT AUTHORIZED

No Native Build61 prep/archive/upload.
No TestFlight upload.
No HealthKit policy mutation.
No Cardio reconciliation.
No strategic eligibility changes.
No production data mutation.
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
LIVE_PERFORMANCE_REMEASURED
HOME_SERVER_IMPROVEMENT_LIVE
TRAINING_LOGGER_SERVER_IMPROVEMENT_LIVE
PHOTOS_SERVER_IMPROVEMENT_LIVE
PAYLOAD_PROJECTIONS_LIVE
NON_PROJECTED_PARITY_PASS
COMMON_SERVER_PATHS_UNDER_3S_OR_NOISE_EXPLAINED
HEALTHKIT_CARDIO_PATH_UNCHANGED
TRAINING_DAY_CARDIO_UNCHANGED
NATIVE_BUILD60_UNCHANGED
BUILD61_NOT_RELEASED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
