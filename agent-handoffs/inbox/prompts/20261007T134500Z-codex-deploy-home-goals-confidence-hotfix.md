PhysiqueOS production incident — deploy Confidence V3 Home/Goals compatibility hotfix

Continue in the SAME dedicated Codex Home/Goals production-incident conversation and current provided work environment.

Do NOT create/delegate to sub-chats, child tasks, additional Codex sessions, or unnecessary worktrees.

FOUNDER AUTHORIZATION

Founder explicitly authorizes deployment of the isolated Server incident hotfix:

e7ffc6716706ae4d2140008a1655bfed95a93889

Incident report:
1ee82568ca38f05f6ebc1afd6a03e9f21cb92e70

Current expected production Server:
1b6687ffbf016575e674d12406200c3792eb90a7

Current deployment:
cbe6be96-12c5-474f-a8bf-f01ba8076121

Retained prior rollback lineage:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8

Production-read tooling:
d789ce2770eda2f9bdb13a48bbc572901f2c61e2

INCIDENT ROOT CAUSE

A valid canonical Confidence V3 assessment published at 2026-10-07 05:47 PDT has:
- movement increase;
- prior 79;
- current 80;
- direction-neutral generic narrative.

The shared Home/Goals V3 presentation path incorrectly uses the generic narrative as the movement display sentence and then fails:
CANONICAL_CONFIDENCE_PRESENTATION_INCREASE_DIRECTION_CONTRADICTION

The hotfix derives the V3 movement display sentence from canonical structured movement/percentages while preserving the rich canonical narrative separately.

Adaptive Progression V1 is NOT the cause and must remain deployed.

GOAL

Deploy only e7ffc671 as a normal fast-forward on top of current production 1b6687ff.

Then verify:
- Server authority/health;
- exact Home read;
- exact Goals read;
- Confidence V3 presentation;
- existing Evidence control if useful;
- no regression to Adaptive Progression V1 authority.

Preserve the Founder's current Build 90 pairing/session.

PREDEPLOY

Freshly verify:
- refs/heads/combined-app-platform-cutover exact 1b6687ff;
- active deployment exact expected current authority or otherwise explain;
- no transitional/in-progress deployment;
- web/worker/runtime exact 1b6687ff;
- health/live 200;
- health/ready 200 with all checks ready;
- candidate e7ffc671 is pushed, clean, and a normal fast-forward from 1b6687ff;
- candidate diff is limited to the audited Confidence read-service hotfix + regression test;
- no migration;
- no backfill;
- no topology/cost/dependency/image change;
- no Native change.

If any authority or candidate scope differs:
STOP before mutation.

PREDEPLOY TEST GATE

Re-run the focused incident regression gate from the candidate:
- production-shaped V3 direction-neutral increase;
- ActiveGoalConfidencePresentation read;
- canonical invariant;
- Core Home;
- Goals;
- weekly/midweek Confidence publication integration as applicable.

Require green.

Also run git diff --check.

DEPLOYMENT

Use the established guarded production Server deployment workflow.

Normal fast-forward only:
1b6687ff
->
e7ffc6716706ae4d2140008a1655bfed95a93889

Preserve live App Platform spec except established web/worker release-stamp updates.

Trigger only the established intended deployment/rebuild sequence.

No data mutation.
No Confidence record rewrite.
No migration/backfill.
No credential change.
No pairing change.
No Native release.

POSTDEPLOY AUTHORITY

Require:
- ACTIVE 9/9;
- no pending deployment;
- production ref exact e7ffc671;
- web source exact e7ffc671;
- worker source exact e7ffc671;
- runtime PHYSIQUEOS_GIT_SHA exact e7ffc671;
- coherent build ID;
- health/live 200;
- health/ready 200 with all checks ready.

POSTDEPLOY INCIDENT VERIFICATION

Using the established canonical-owner read-only path and/or exact Native production read contract, verify fresh:

1. HOME
GET/read equivalent of Build 90:
native/read/home presentationVersion=2 with device-compatible timezone semantics.

Require:
- successful resource contract;
- no Confidence contradiction;
- active goal Confidence projection present;
- movement increase;
- prior 79/current 80 if still the active latest assessment;
- movement display sentence is direction-explicit;
- canonical rich V3 narrative remains present separately;
- no raw Founder narrative emitted in report.

2. GOALS
GET/read equivalent:
native/read/goals

Require:
- successful resource contract;
- no Confidence contradiction;
- active goal projection valid.

3. EVIDENCE CONTROL
Only if useful:
verify one known-good Evidence read still succeeds.

4. ADAPTIVE PROGRESSION CONTROL
Confirm production still contains the Adaptive Progression V1 runtime code/behavior introduced by 1b6687ff.
Do not rerun the full three-exercise Founder shadow unless needed.
A source/targeted regression check is sufficient if no Training code changed in this hotfix.

PAIRING / SESSION

Do not rotate, invalidate, re-pair or reinstall.

If Server reads are green, explicitly instruct Founder to reopen/refresh Home and Goals on the existing Build 90 installation.

If the physical app still fails after verified green Server reads:
do not immediately re-pair.
Capture the new timestamp and investigate client cache/session behavior separately.

ROLLBACK

Rollback only if:
- deployment/source/health fails;
- Home/Goals remain structurally invalid due to the hotfix;
- another safety regression is introduced.

Preferred rollback source for THIS hotfix is:
1b6687ffbf016575e674d12406200c3792eb90a7

Do NOT roll all the way back to b7eb1e39 unless separately justified.

Use exact guarded rollback authority checks.

REPORTING

Publish one main-visible incident-resolution report with:
- predeploy authority;
- candidate scope;
- focused tests;
- exact deployment id;
- postdeploy web/worker/runtime source;
- health;
- Home verification;
- Goals verification;
- Confidence presentation result;
- Adaptive Progression preservation;
- rollback status;
- exact Founder next action;
- confirmation no data rewrite/migration/backfill/Native/pairing mutation.

Final status if green:
Home/Goals Confidence V3 incident hotfix deployed and verified.

Notify:
PhysiqueOS incident — Home/Goals production reads restored; Founder verification requested.

STOP.

END TASK.