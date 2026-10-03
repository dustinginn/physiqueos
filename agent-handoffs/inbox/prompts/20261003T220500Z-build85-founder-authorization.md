Founder authorization — Build 85 trusted Watch correlation + TestFlight release

Founder has manually confirmed today's existing 95% Pending Review by choosing the correct Logger session.

That review is now considered an explicit Founder reconciliation of the pre-activation workout. Do not attempt to retroactively convert it into exact trusted correlation.

Authorize the reviewed Build 85 sequence from:
agent-handoffs/reports/20261003T212700Z-build85-watch-candidates-policy-authorization-gate.md

EXACT SERVER CANDIDATE

Deploy exact Server SHA:
3c0f4aefddbb9a6886f6ad012443978303d47024

Use the established guarded production deployment workflow.

Before deploy:
- reverify current production authority;
- confirm exact candidate SHA matches independent review;
- confirm no unrelated source drift.

After deploy:
- require deployment ACTIVE;
- require all health checks green;
- require web and worker exact SHA;
- require live/ready healthy.

EXACT TRUSTED-WATCH POLICY

After deployment, rebuild and re-run the exact dry run against deployed Server SHA 3c0f4aefddbb9a6886f6ad012443978303d47024.

Require the reviewed facts to remain exact:

effective boundary:
2026-10-05T07:00:00.000Z

source bundle:
com.physiqueos.native.dev

activity type:
50

indoor required:
true

tolerance:
120 seconds

prospectiveOnly:
true

historicalBackfill:
false

planned desired-record digest:
fc028029635cb7ba1de6301206f5f8a8

Expected mutation:
exactly one policy row plus exactly one audit row.

Expected historical/strategic mutation:
zero.

If any dry-run fact differs, effective boundary has elapsed, production policy unexpectedly exists, or plan digest changes:
STOP without mutation and publish a refreshed gate.

If all facts remain exact, Founder authorizes the create-only prospective policy activation.

No overwrite/update of an existing policy row is authorized.

POST-ACTIVATION VERIFY

Independently verify:
- exact policy record stored;
- exact audit row stored;
- zero historical workout/review mutation;
- zero historical backfill;
- today's manually confirmed workout remains merely the explicit Founder reconciliation it already is;
- no strategic artifacts changed;
- no Sleep records changed;
- no DEXA policy/state changed;
- no duplicate Training evidence;
- no duplicate canonical workout created;
- future eligible PhysiqueOS Watch workouts can use exact trusted correlation prospectively only.

NATIVE BUILD 85

After Server + policy verification, proceed with exact reviewed Native candidate:

b8ee8690b194cb90086b62816b9a2c8c400dc026

Use Build number 85.

Run final:
- Release archive;
- signing/profile/entitlement verification;
- app + Watch extension embedding verification;
- DEXA Build 84 regression;
- Sleep v3 decode regression;
- Watch finish/cancel/reconnect regression;
- Live Activity regression;
- trusted workout-correlation focused tests;
- PR celebration lifecycle tests.

If exact candidate changes for any legitimate release correction, require fresh review before upload.

TESTFLIGHT

Founder authorizes guarded TestFlight-first upload of exact reviewed Build 85 candidate.

No tethered-device gate.

Wait for VALID.

Do not open/login to App Store Connect in a browser.

Use Xcode/guarded uploader only.

PHYSICAL ACCEPTANCE AFTER VALID

Next real workout should prove:

1. Always-On/inactive display no longer falsely shows OFFLINE merely because the screen dims.
2. Genuine phone-authority loss still surfaces/fails closed appropriately.
3. PhysiqueOS Watch-started strength workout automatically correlates with its Logger session.
4. No generic 95% Workout Match review is created for the trusted workout.
5. Exactly one Training session/evidence save remains.
6. Exactly one Apple Health workout remains.
7. PR celebration uses larger confetti and still appears only once.
8. Existing DEXA/Sleep/Cardio behavior remains unchanged.

TODAY'S MANUAL REVIEW

Founder has already confirmed today's pre-activation Pending Review.

Do not mutate it further unless a later read-only audit proves a real problem.

BACKLOG

Update:
- today's pre-activation review = manually reconciled by Founder;
- Build 85 trust policy active if activation passes;
- Build 85 TestFlight status;
- physical acceptance pending for next natural workout.

REPORTING

Publish GH checkpoint after Server deploy/policy activation.
Publish final GH report after Build 85 VALID.

Follow mandatory GH-main protocol at every stop.

END AUTHORIZATION.
