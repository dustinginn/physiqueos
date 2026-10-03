DEXA -> Apple Health physical validation closeout + prospective activation gate

TASK TYPE

Codex production read-only closeout audit + durable acceptance report + permanent-policy activation candidate.

Founder has completed the real physical Sep 12 validation successfully on Build 84.

DO NOT infer permanent-policy activation merely from this successful test.
First prove post-validation invariants read-only.
Then prepare/review the exact activation change.
If the activation requires a production mutation, STOP with exact mutation/policy details and request Founder authorization unless an existing direct authorization explicitly covers it.

READ FIRST

Build 84/server release:
agent-handoffs/reports/20261003T153612Z-dexa-healthkit-server-deployed-build84-valid.md
main d3dfdd38e5642794eff856cd48f3ddd84401b54e

DEXA implementation report:
agent-handoffs/reports/20261003T074545Z-dexa-healthkit-writeback-overnight-implementation.md
main 66ac9859cfcd3eb8def8cb2d0904aad634c2d511

DEXA audit:
agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md

Backlog and mandatory GH/read-only protocols.

CURRENT AUTHORITIES

Production Server:
b47663b32372a78010dbc8e4aa41303012d98dc7
deployment b9449c52-5444-4dae-9f44-fd0261b1a9d3
Reverify.

Native:
Build 84 bcd92c74602695766c270fe6af052de45afece4b
TestFlight VALID delivery a4b7b504-e0ba-4cb5-9909-3e01cc8156d5
Founder installed Build 84.

FOUNDER PHYSICAL OBSERVATIONS — ACCEPTED FACTS TO RECORD

Founder enabled DEXA -> Apple Health in Build 84.

Founder invoked the explicit Sep 12 physical validation.

PhysiqueOS wrote and verified exactly the real canonical Sep 12 pair:
- Body Fat Percentage: 8.1%;
- Apple Health Lean Body Mass: 160.5 lb fat-free mass, calculated as 174.7 total - 14.2 fat.

Apple Health visibly showed:
- Body Fat Percentage 8.1, Sep 12, source PhysiqueOS;
- Lean Body Mass 160.5 lb, Sep 12, source PhysiqueOS.

Apple Health did not receive a DEXA Weight measurement.

Founder then invoked the guarded deletion confirmation.

PhysiqueOS reported Deleted.

Founder independently verified both Sep 12 PhysiqueOS validation entries are gone from Apple Health.

The canonical Sep 12 DEXA inside PhysiqueOS was not deleted or modified by this operation.

A. READ-ONLY POST-VALIDATION PRODUCTION AUDIT

Use approved production read-only path:
- exact runtime authority gate;
- BEGIN READ ONLY / REPEATABLE READ;
- verify transaction_read_only=on;
- owner-scoped bounded SELECTs;
- ROLLBACK;
- no credentials/health exports in report.

Prove:

1. Permanent DEXA writeback policy is still disabled.
2. Permanent writeback intents remain zero for historical/pre-Oct-9 scans.
3. No historical backfill occurred.
4. Sep 12 canonical DEXA identity/revision remains intact.
5. No duplicate DEXA canonical record/evidence was created by own HealthKit samples.
6. No PhysiqueOS-owned Body Fat/Lean Body Mass observation became evidence.
7. No generic Weight canonical record/day was changed by the validation.
8. No DEXA Weight write intent/receipt exists.
9. No Confidence history/snapshot changed due to validation.
10. No Narrative/recommendation/Briefing strategic artifact changed due to validation.
11. No feedback-loop writeback intent was generated.
12. Receipt/validation state is consistent with write then delete, if validation receipts are intentionally persisted.
13. Sleep v3 remains unchanged.
14. Build 83/84 Training/Cardio state is unaffected.

Where possible compare stable counts/digests to pre-validation authority recorded in prior reports.

Do not expose raw private health data beyond the two values Founder explicitly supplied/confirmed in this chat.

B. VALIDATION VERDICT

If all invariants pass:
declare physical validation PASS.

If anything differs unexpectedly:
STOP.
Do not enable permanent policy.
Publish exact discrepancy and safest next investigation.

C. PERMANENT POLICY TARGET

Founder intent after successful validation:
make the upcoming 2026-10-09 DEXA the first permanent automatic DEXA -> Apple Health writeback.

Prepare exact production policy:

enabled: true
effectiveFromScanDate: 2026-10-09
prospectiveOnly: true
historicalBackfill: false
measurementKinds:
- bodyFatPercentage
- leanBodyMassFatFree
schema/version: exact implemented version

Semantics:
- only canonical accepted DEXA scans;
- automatic after acceptance;
- Body Fat % + fat-free Lean Body Mass;
- NO Weight;
- corrections replace own samples exactly once;
- toggle OFF on device stops future device writes;
- historical scans before Oct 9 never become permanent intents;
- no automatic backfill when enabling.

D. ACTIVATION SAFETY

Before mutation:
- independently review exact policy write/activation path;
- prove enabling policy cannot create intents for Sep 12 or any pre-Oct-9 scan;
- prove effective date uses canonical scan date, not confirmation/import date;
- prove no current scan on/after Oct 9 exists yet;
- dry-run resulting intent set: expected zero today;
- prove Build 84 understands the enabled policy;
- prove Build 83 remains backward-compatible/unchanged.

If policy storage is a production data mutation:
publish a checkpoint containing:
- exact current Server SHA;
- exact policy record to be written;
- dry-run intent count;
- review verdict;
- expected post-write state;
then STOP for Founder direct authorization.

Do not enable silently.

E. VALIDATION UI CLEANUP DECISION

Audit the Founder physical-validation controls now that the test passed.

Recommend one:
1. hide/remove Sep 12 validation controls from normal Build 84+ UI after acceptance;
2. retain behind Founder diagnostics/developer section;
3. retain temporarily until Oct 9 real scan succeeds.

Do not create a new Native build solely for cosmetic removal unless necessary.
Record recommendation/backlog.

The normal DEXA -> Apple Health toggle remains.

F. OCT 9 ACCEPTANCE PLAN

After policy activation, the real Oct 9 flow should be:

DEXA scan
-> upload through normal PhysiqueOS DEXA intake/Priority
-> Evidence Review
-> Founder confirms/corrects
-> canonical accepted DEXA
-> Server emits exactly two permanent intents
-> Build 84 reconciles
-> Apple Health receives BF% + fat-free LBM
-> status Saved
-> no Weight
-> no feedback loop.

Prepare concise Oct 9 acceptance checklist:
- values match canonical scan;
- source PhysiqueOS;
- timestamp/date precision correct;
- exactly one each;
- Weight absent;
- receipt durable;
- no duplicate evidence/Weight;
- correction test only if naturally needed, not by altering real scan unnecessarily.

G. DURABLE RECORD

Update backlog:
- Build 84 physical validation PASS if audit proves it;
- exact observed write/delete facts;
- permanent policy status;
- Oct 9 plan;
- validation UI cleanup recommendation.

Publish report:
agent-handoffs/reports/<timestamp>-dexa-healthkit-physical-validation-closeout.md

Follow mandatory GH-main protocol.

If activation authorization is required, also publish:
agent-handoffs/inbox/review-requests/<timestamp>-founder-authorization-dexa-healthkit-prospective-activation.md

END TASK.
