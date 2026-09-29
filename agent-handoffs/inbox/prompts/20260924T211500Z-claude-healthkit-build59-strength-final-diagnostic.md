Task id: claude-healthkit-build59-strength-final-diagnostic-20260924

Continue in the existing persistent HealthKit Founder Takeover Claude conversation. Reasoning: high.

This is a READ-ONLY DIAGNOSTIC task first. Do not patch, deploy, upload, mutate policy/data, activate Cardio, or reconcile deferred workouts until a subsequent explicit authorization.

Current accepted authority:
Production Server: 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7, deployment 8da160ac-7ae5-4b69-8fd7-342cfff30099.
Installed Native: combined Build 59, release a269700b.
Reverify before relying on these values.

Founder Build 59 acceptance:
- Sep23 Training Detail is GOOD.
- Sep24 Training Detail FAILS to load and displays only: “This session could not be loaded.”
- Before Build 59 / current Server correction, Sep24 structured Logger detail existed and contained Leg Press Machine + Walking Lunge. Apple Health has a discrete Sep24 Traditional Strength Training workout at ~11:22–11:50 AM, ~27:58, 206 active cal, avg HR 120.
- The earlier forensic audit proved the Logger evidence package had a synthetic 94-minute commit-time fallback because finishedAt was absent. Server 01d1900b was intended to present real HK telemetry without mutating that frozen evidence.
- Whole-day Sep24 Activity/Nutrition automatic sync remains accepted healthy.
- Sep23 Activity repair remains cancelled/not required.
- Cardio remains NOT activated. Do not change that in this task.

Task:
Diagnose exactly why Sep24 Training Detail now returns/decodes/renders as “This session could not be loaded” while Sep23 Training Detail is healthy.

Trace end-to-end:
1. exact Native navigation/session identifier selected for Sep24;
2. Native request path/URL/DTO and failure state;
3. production Server endpoint and lookup key;
4. canonical Logger session/evidence package identity;
5. candidate/confirmed HK Strength relationship/presentation projection introduced in ca21aa26/01d1900b;
6. response payload and mapper validation;
7. whether failure is HTTP/not-found/server exception/invalid DTO/identity mismatch/client decode/presentation guard;
8. why Sep23 is unaffected.

Use bounded read-only production inspection through the approved path when necessary. No writes.

Critical correctness:
- Do not “fix” this by reverting HK telemetry presentation.
- Desired Sep24 detail is the existing Logger exercises/sets plus the discrete canonical Apple Health Strength telemetry (~11:22–11:50, ~28 min, 206 active cal, HR120) when the Server can deterministically present it.
- Do not invent a confirmed link if it is still only a candidate.
- Do not mutate the frozen Logger evidence package.
- Do not merge either adjacent Indoor Walk into Strength.
- Do not activate Cardio.

Also inventory the deferred Cardio backlog needed immediately after Strength is accepted:
- identify all Founder workout observations since the Cardio-relevant start boundary that are deferred solely as family_not_in_activation_scope and classified cardio;
- at minimum account for the two known Sep24 Indoor Walks;
- determine whether Sep23 and/or subsequent days contain additional cardio workouts that will need bounded reconciliation once Cardio is activated;
- report exact identities/dates/types and current defer/canonical state.
This inventory is read-only. Do not reconcile anything.

Return:
- proven root cause of Sep24 detail failure;
- smallest correction plan and exact files/tests;
- whether Server-only, Native-only, or both;
- regression proving Sep23 stays good;
- production-shaped Sep24 fixture proving Logger detail + HK telemetry coexist;
- complete bounded deferred-Cardio inventory for the eventual Cardio activation/reconciliation phase.

Publish a timestamped report to agent-handoffs/reports/ on main and update HealthKit latest.json/latest.md because HealthKit owns primary authority. Stop for Founder direction.

Flags:
AUTHORITY_REVERIFIED
SEP23_TRAINING_DETAIL_HEALTHY
SEP24_TRAINING_DETAIL_FAILURE_REPRODUCED
SEP24_FAILURE_ROOT_CAUSE_PROVEN
SEP24_LOGGER_IDENTITY_PROVEN
SEP24_HK_STRENGTH_IDENTITY_PROVEN
SEP24_RESPONSE_CONTRACT_TRACED
MINIMAL_STRENGTH_FIX_DESIGNED
DEFERRED_CARDIO_BACKLOG_INVENTORIED
SEP24_WALK1_ACCOUNTED
SEP24_WALK2_ACCOUNTED
ADDITIONAL_CARDIO_BACKLOG_ACCOUNTED
PRODUCTION_MUTATED
POLICY_MUTATED
CARDIO_ACTIVATED
DEFERRED_CARDIO_RECONCILED
GH_REPORT_PUBLISHED
