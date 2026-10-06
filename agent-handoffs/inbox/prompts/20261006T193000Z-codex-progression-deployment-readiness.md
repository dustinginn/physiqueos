PhysiqueOS Training progression correction — Server deployment-readiness

TASK TYPE

NEW Codex lane.

This is deployment-readiness / integration / read-only production verification for the already completed post-Build-89 Server candidate.

DO NOT deploy production in this task.

AUTHORITIES

Build 89 Native is VALID and independent of this work.

Progression audit:
e6c10085e12da4223e6430bc1f47a9e0b6c4aa84

Founder-policy implementation task:
e5347f4d388b1fa4a953132865fc041c45d9d152

Progression Server candidate:
999a225a38ced9ddb16a65bbe840896472265468

Candidate branch:
codex/training-progression-authority-server-candidate-20261006

Candidate base/current Server lineage at creation:
b7eb1e397f0238df9ae904fd182ddbb51602e8d8
origin/combined-app-platform-cutover

Production deployment previously reported:
6fa4e887

FOUNDER POLICY — DO NOT ALTER

Progression eligibility at the current prescription/load/context requires BOTH:

- configured successful-session count, currently 2;
- at least 14 days from the FIRST qualifying successful session in the current load/prescription/context run.

Successful repeats add evidence and DO NOT reset the 14-day exposure clock.

New load/prescription/context starts a new exposure window.

Keep Operating Plan Training Strategy as executable progression authority.
Keep Server as decision authority.
Do not introduce Native progression math.

GOAL

Produce an exact Server deployment candidate, verify it against the current Server lineage and bounded real Founder production history using the approved read-only PC path, simulate corrected recommendations without writes, prove regressions, and publish a deploy/rollback package.

STOP for Founder authorization before production deploy.

STEP 1 — CURRENT SERVER AUTHORITY

Reverify:
- current origin Server integration/production lineage;
- current production Server SHA/deployment;
- whether any Server commits landed after b7eb1e39 that affect progression, training reads, protocols, canonical evidence, cache, auth, or deployment.

Do not assume b7eb1e39 remains current merely because Build 89 report said so.

If current Server lineage advanced:
- integrate 999a225a onto the exact current lineage in a new isolated worktree/branch;
- resolve semantically;
- do not overwrite newer unrelated Server behavior.

If unchanged:
- still create a clean deployment-candidate authority/ref.

Report exact merge base and resulting candidate SHA.

STEP 2 — SOURCE / CONTRACT AUDIT

Verify resulting candidate preserves:

- active Operating Plan Training Strategy authority;
- configured successfulSessionsRequired;
- minimumExposureDays = 14 compatibility/default;
- first-qualifying-success exposure anchor;
- successful repeat does not reset exposure;
- new load/context reset;
- regression/recovery semantics;
- exact exercise identity;
- variant;
- relationship/superset context;
- fail-closed strategy ambiguity;
- backward-compatible Native recommendation contract;
- training-logger cache invalidation;
- no migration/backfill requirement.

Audit all changed Server files against current production lineage.

STEP 3 — APPROVED PC READ-ONLY PRODUCTION VERIFICATION

Use ONLY the established approved PC production-read path.

Authority pattern from project operations:
C:\Users\dusti\Documents\GitHub\physiqueos
PowerShell/Node
runner:
.tmp/digitalocean/run-app-console-context-gzip-source-on-open.mjs

Use explicit saved doctl context:
physiqueos-final-cutover-config

Historically verified app/component:
app id bf57cf56-48cc-4cd6-90e4-a23ee5381741
component web

BUT reverify current authority before use.

The runner executes bounded Node audit inside the production App Platform component and consumes existing PHYSIQUEOS_DATABASE_URL/CA bindings internally.

NEVER:
- paste/print/export/store database credentials;
- create .env credentials;
- manually decrypt credentials.

Every SQL audit:
BEGIN READ ONLY;
verify transaction_read_only = on;
bounded owner-scoped SELECTs only.

Stop on:
401/403;
unavailable console/binding;
read-only verification failure;
scope ambiguity.

No writes.

FOUNDER CASE — CABLE MACHINE FRONT RAISES

Boundedly verify current canonical production history for:
canonical exercise id cable_machine_front_raise

Retrieve only what is needed:
- recent relevant finalized sessions;
- dates;
- canonical session ids;
- exact exercise id/display identity;
- variant;
- relationship comparison context;
- performed sets/reps/load;
- finalized/quality/supersession state;
- active Training Strategy/protocol/version;
- progression default rule;
- successfulSessionsRequired;
- minimumExposureDays if persisted;
- any fields needed to compute the corrected policy.

Do not dump unrelated Founder training history.

STEP 4 — READ-ONLY SHADOW RECOMMENDATION

Using the exact production rows read above and the deployment-candidate code/policy, calculate WITHOUT WRITING:

A. what current production Build b7eb1e39 recommends;
B. what deployment candidate recommends;
C. why they differ;
D. qualifying-success count;
E. exposure start;
F. exposure days;
G. session-count gate;
H. exposure gate;
I. exact context partition;
J. target availability/provenance.

Founder has been following suggested progression. Explicitly verify whether the corrected policy would now classify Cable Machine Front Raises as progression-eligible.

If target load cannot safely be inferred, preserve candidate semantics:
progression_opportunity + consider_progression + unavailable target.

Do not fabricate a load.

STEP 5 — CONTROL CASES

Select a very small bounded production sample:
- one exercise currently expected to Maintain;
- one exercise currently expected to be a Progression Opportunity if available.

Run the same current-vs-candidate shadow calculation.

Goal:
prove the correction fixes the inversion without turning every movement into an opportunity.

Do not publish unnecessary personal workout detail.

STEP 6 — TESTS ON EXACT DEPLOYMENT CANDIDATE

Run:
- Phase 6 Training suite;
- focused progression policy/protocol/Logger/read-contract/Native-contract/Postgres suites;
- broader relevant Server tests for Training Logger and Operating Plan;
- lint changed files;
- git diff --check;
- any deployment/config verification normally required.

If repository-wide suites contain known unrelated environment failures, separate them precisely. Do not hide progression failures behind baseline noise.

STEP 7 — DEPLOYMENT PACKAGE

Prepare but DO NOT execute:

- exact deployment candidate SHA;
- exact current production base;
- changed-file list;
- no-migration statement;
- pre-deploy checks;
- deploy command/path using established controlled DigitalOcean flow;
- post-deploy health checks;
- bounded post-deploy Founder case verification;
- control-case verification;
- cache considerations;
- rollback SHA/command;
- rollback validation;
- estimated blast radius;
- explicit stop/abort conditions.

No production deployment.

BUILD 89 / BUILD 90 ISOLATION

Do not modify Native Build 89.
Do not touch Build 90 redesign work.
No Native build bump.
No TestFlight.

REPORTING

Publish a main-visible report-only handoff.

Report:
- exact deployment candidate;
- current production authority;
- read-only PC verification result;
- Founder Cable case current vs corrected result;
- bounded control cases;
- tests;
- contract compatibility;
- migration/backfill;
- deployment plan;
- rollback;
- risks;
- explicit recommendation DEPLOY / DO NOT DEPLOY.

If clean, status:
Training progression correction — deployment candidate verified; awaiting Founder deploy authorization.

STOP.

FINAL NOTIFICATION

Notify:
PhysiqueOS Training progression — deployment readiness complete; Founder authorization required.

END TASK.