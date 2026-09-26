Task id: claude-active-goal-v3-server-deploy-20260925

Continue in the existing persistent PhysiqueOS Active Goal V3 Claude conversation. Reasoning: high.

Founder has explicitly ACCEPTED the round-3 Active Goal V3 content and authorizes deployment of the exact reviewed Server candidate:
2a23eee762472081815d9122b97c0f0a9f1b8969
on branch claude/active-goal-v3-server-20260925.

This task authorizes SERVER DEPLOYMENT + POSTDEPLOY READ-ONLY VERIFICATION ONLY.

Do NOT release Native efcb8574. Do NOT prepare/archive/upload Build61. The prospective Cardio acceptance remains on unchanged Build60.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/goal-v3/latest.json
agent-handoffs/reports/20260926T035810Z-goal-v3-round2-candidates-acceptance.md
agent-handoffs/reports/20260926T041308Z-goal-v3-round3-final-content-acceptance.md
agent-handoffs/reports/20260926T041308Z-goal-v3-round3-final-content-preview.md
agent-handoffs/training-localday/latest.json
agent-handoffs/performance/latest.json
HealthKit latest.json/latest.md only for protected Cardio authority; do not modify those pointers.

Expected current production authority, reverify:
Server 09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e
Deployment e979ee19-44f3-4c7a-ab2b-3c6e4f773349 ACTIVE
Native Build60 00321dcc6dd86a6479dbca5dd27e691c87348cd8
Native efcb8574 unreleased
Workout policy v4 [cardio,strength]
Prospective Cardio Indoor/Outdoor acceptance still pending.

PREDEPLOY

Reverify:
- exact app/components and ACTIVE production deployment;
- production branch exactly 09f04dc5;
- 2a23eee7 is a clean fast-forward descendant;
- candidate branch/worktree clean and exact reviewed SHA;
- exact-candidate production webpack validation remains authoritative; rerun only if needed;
- no schema/migration/infra drift;
- live/ready health;
- current active Goal canonical facts/DEXA selection;
- current Confidence V3/latest briefing identities;
- completed Visible Abs read-model control;
- workout policy/Cardio canonical state/Activity/Strength links/claims/strategic digests;
- current migration state.

Abort on unexpected authority/data drift that invalidates the reviewed candidate.

DEPLOY

Use the established guarded PhysiqueOS two-step DigitalOcean procedure:
1. exact quoted clean fast-forward production branch update;
2. apps update --spec changing only PHYSIQUEOS_GIT_SHA and PHYSIQUEOS_BUILD_ID on BOTH web and worker;
3. create-deployment --force-rebuild.

No schema migration expected.
No Native change.
No production data mutation.

POSTDEPLOY AUTHORITY / HEALTH

Require:
- deployment ACTIVE;
- web + worker source_commit_hash exactly 2a23eee762472081815d9122b97c0f0a9f1b8969;
- runtime/log gitSha and buildId exact;
- live 200;
- ready healthy/all checks;
- migrations unchanged;
- no unexpected error logs.

POSTDEPLOY ACTIVE GOAL VERIFICATION

Using the same bounded read-only production-shaped probe, verify the LIVE Server now returns the reviewed Goal currentState contract and corrected Build60-compatible legacy fields.

Prove:
- Goal baseline Jul18 remains baseline;
- latest authoritative DEXA Sep12 selected;
- baseline/current composition values exact;
- +5.8 lb = 58%, 4.2 lb remaining;
- Aug15 milestone uses +0.8 lb, not +5.8;
- guardrail uses Sep12 8.1% and is within range;
- Confidence score/band 79% Moderate and Goal summary uses V3 goal-context thesis, not “one update” movement prose;
- no fictional Server “next review” narrative;
- training progress current;
- turning points include Sep12 and are selective;
- latest canonical Coach’s Take provenance remains Sep23 Midweek and historical text remains unchanged;
- currentState schema active_goal_current_state_v1 present;
- Build60 legacy response remains decoder-compatible.

Because Build60 cannot render the new currentState layout, explicitly distinguish:
LIVE Server correctness now vs final approved Build61 UI later.

SHARED BRIEFING ENGINE FIX

Verify the prospective coverage-aware intake-completeness logic from 2a23eee7 is present/live:
- minority meal-derived days do not mischaracterize/temper whole window;
- majority names share;
- all meal-derived established wording;
- missing/partial/conflicting remain meaningful uncertainty;
- wearable ambiguity does not reintroduce hidden tempering when intake ambiguity is low-materiality.

Do NOT regenerate Sep23.
Do NOT mutate historical briefings.

If safely possible with production-shaped read-only fixtures/current evidence, run the exact future-window engine probe demonstrating the upcoming mostly-HealthKit window would not emit the obsolete whole-window logged-meals caveat. This is simulation/read-only, not publication.

POSTDEPLOY SAFETY / PARITY

Prove:
- completed Visible Abs Goal digest unchanged;
- historical Goal artifacts unchanged;
- no DEXA records mutated;
- no briefing/confidence/narrative artifacts regenerated;
- workout policy remains v4 [cardio,strength];
- canonical workouts/deferred state unchanged;
- prospective Cardio ingestion/classifier/isIndoorWorkout path unchanged;
- Training Day/Training history semantics unchanged;
- Sep23/Sep24 Activity totals unchanged;
- Strength links/claims unchanged;
- strategic digests unchanged except no expected data writes from deployment;
- Performance Phase2 Server gains preserved;
- migrations unchanged;
- production healthy.

PERFORMANCE

Rerun active-goal live read benchmark enough to verify <=3s hard ceiling and <=1–2s preferred warm under normal DB conditions. Separate DB wait from compute if an outlier occurs.

GITHUB

Publish timestamped Active Goal V3 Server deployment checkpoint to agent-handoffs/reports/ on main and update only agent-handoffs/goal-v3/latest.json.
Do NOT modify HealthKit latest.json/latest.md, performance/latest.json, training-localday/latest.json, or Midweek pointers.

Include:
- exact deployment id/SHA/build id;
- live active Goal facts;
- live engine completeness simulation result;
- completed Goal parity;
- HealthKit/Cardio safety;
- performance;
- explicit statements:
  - Founder round-3 content accepted;
  - Server 2a23eee7 live;
  - Native Build60 unchanged;
  - Native efcb8574 unreleased;
  - approved new Goal layout is NOT visible until Build61;
  - Build61 still waits for prospective Cardio acceptance.

STOP after report.

NOT AUTHORIZED

No Build61 prep/archive/upload.
No TestFlight.
No production data mutation.
No historical briefing regeneration.
No DEXA mutation.
No HealthKit policy/reconciliation/ingestion/classifier changes.
No Founder-device operation.

Flags:
FOUNDER_CONTENT_ACCEPTED
AUTHORITY_REVERIFIED
CLEAN_FAST_FORWARD_VERIFIED
PREDEPLOY_ZERO_WRITE_AUDIT_PASS
SERVER_DEPLOYED
WEB_WORKER_SOURCE_COMMIT_EXACT
RUNTIME_SHA_EXACT
HEALTH_LIVE_READY_PASS
MIGRATION_STATE_UNCHANGED
ACTIVE_GOAL_CURRENTSTATE_LIVE
LATEST_DEXA_SEP12_LIVE
GOAL_PROGRESS_58_LIVE
AUG15_DELTA_CORRECT_LIVE
GUARDRAIL_8_1_WITHIN_RANGE_LIVE
CONFIDENCE_V3_GOAL_THESIS_LIVE
TRAINING_PROGRESS_CURRENT_LIVE
TURNING_POINTS_CURRENT_LIVE
COACHS_TAKE_PROVENANCE_LIVE
HEALTHKIT_COMPLETENESS_ENGINE_FIX_LIVE
FUTURE_WINDOW_COMPLETENESS_PROBE_PASS
HISTORICAL_BRIEFINGS_UNCHANGED
COMPLETED_GOAL_UNCHANGED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
PERFORMANCE_PHASE2_GAINS_PRESERVED
ACTIVE_GOAL_PERFORMANCE_BOUNDED
BUILD60_UNCHANGED
NATIVE_EFCB8574_UNRELEASED
APPROVED_GOAL_LAYOUT_AWAITS_BUILD61
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
