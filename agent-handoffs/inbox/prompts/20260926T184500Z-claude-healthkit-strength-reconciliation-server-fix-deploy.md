Task id: claude-healthkit-strength-reconciliation-server-fix-deploy-20260926

Proceed in the existing NEW Claude HealthKit lane from the completed Sep 24 Strength reconciliation diagnosis.

Read first:
agent-handoffs/reports/20260926T183000Z-healthkit-strength-reconciliation-timing-diagnosed-fixed.md
agent-handoffs/reports/20260926T170800Z-healthkit-prospective-cardio-outdoor-walk-acceptance-PASS.md
agent-handoffs/inbox/prompts/20260926T120000Z-chatgpt-physiqueos-master-thread-handoff.md
agent-handoffs/STANDING_DISK_SAFETY.md

Founder authorizes deployment of the already-prepared, reviewed Server-only Strength reconciliation timing fix.

Reviewed candidate:
524f1882072cb5c17c4fe61f7210f0f7d1c6e67c

Current production authority before deployment is expected to be:
2a23eee762472081815d9122b97c0f0a9f1b8969
Deployment 14d52e0a-034b-4d9e-949e-b2602c29dbfc
Provider migration 000014 unchanged.

Reverify all authority before operating. Stop on unexpected divergence rather than improvising.

Scope:
Deploy only the reviewed Server fix represented by 524f1882, preserving all later accepted production behavior and with no unrelated changes.

Before deployment, prove the candidate is based correctly on current production authority and that the diff is limited to the reviewed Strength reconciliation timing correction and its tests. Re-run whatever focused deterministic validation is appropriate if authority or candidate ancestry requires it.

Use the established guarded DigitalOcean deployment procedure. Do not expose credentials. Do not mutate production data for acceptance. No schema change is expected.

Postdeploy acceptance must prove:
live/ready healthy;
source SHA/runtime gitSha/buildId match the deployed reviewed authority;
migration count/state unchanged;
workout policy remains families cardio,strength with strategic eligibility quarantined, historicalBackfill false, linkAutoConfirm false;
prospective Cardio acceptance behavior remains intact;
historical Sep23/24 Cardio controls remain intact;
existing confirmed Strength links remain intact;
Sep24 Strength candidate/review remains unresolved unless the Founder separately confirms it on-device;
no duplicate links/claims or one-to-one integrity violations;
no historical briefing/confidence/Goal strategic artifacts regenerated or rewritten;
the fixed server path is live;
bounded performance/health checks show no material regression.

Do NOT manually confirm the Sep24 Strength relationship. Do NOT replay the Founder action. Do NOT operate the Founder device. Do NOT change strategic eligibility. Do NOT prepare/archive/upload Native Build 61 in this task.

Build 61 remains a separate Founder authorization gate. Intended Native lineage remains:
efcb8574d38d7462c3e2ccb0fd0e04ccb936517d
unless a separately reviewed later decision supersedes it.

After successful deployment, publish a GH report/pointer with exact production SHA/deployment/buildId, health, migration state, zero-write acceptance findings, Strength/Cardio integrity controls, tests/review status, and explicit confirmation that Native Build 61 was not prepared/uploaded.

If deployment cannot be proven safe from current authority, stop and report rather than modifying the candidate ad hoc.

END TASK.
