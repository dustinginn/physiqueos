DEXA -> Apple Health writeback — overnight implementation from approved plan

TASK TYPE

Codex implementation + review + dormant Server deploy + Native next-build candidate + synthetic/deterministic validation.

Founder explicitly resumes the previously READY/HOLD DEXA HealthKit writeback project.

Goal:
Get as much of the DEXA -> Apple Health writeback implementation safely complete overnight as possible so it is ready well before the real DEXA on Friday 2026-10-09.

Do NOT fabricate health measurements.
Do NOT write anything into the Founder's real Apple Health tonight unless the exact real Sep 12 physical validation is explicitly performed later with Founder awareness/authorization.
Do NOT historical-backfill Apple Health.
Do NOT disturb Build 83 Watch/Training acceptance, Sleep v3, or production strategic behavior.

READ FIRST

DEXA audit/plan:
agent-handoffs/reports/20261002T235405Z-dexa-healthkit-writeback-audit-plan.md
main authority 789aafd9cc2b4b95dee71c0fd3ee9eb0d51a2422

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md
Read the DEXA READY/HOLD section containing Founder-approved decisions.

Build 83 final:
agent-handoffs/reports/20261003T055504Z-build83-server-d3-native-testflight-final.md
main 0679b399789d38f4eb286b54f3fe2ff58a1b735c

GH protocol and disk safety.

CURRENT AUTHORITIES

Production Server:
89fe0a0340adee22d15b92a1f074a0bbd348ac77
deployment 28678d4a-e3cc-4b2b-a479-1851ab7093bf
Reverify before Server work/deploy.

Native Build 83:
3e61dd215e8474c52bd54230d2d9dfb2f3a93534
TestFlight VALID delivery 507b409f-a29f-48a0-93b4-49ab46b5ad6d
Founder will physically test Build 83 in gym tomorrow.

Build 83 physical acceptance is independent. DEXA work must preserve every Build 83 behavior.

FOUNDER-APPROVED PRODUCT DECISIONS

1. V1 permanent write set:
   - Body Fat Percentage;
   - Apple Health Lean Body Mass calculated as fat-free mass = canonical DEXA totalMass - fatMass.
   Do NOT write raw DEXA lean soft tissue as Apple Health Lean Body Mass.

2. Do NOT write DEXA total mass to Apple Health Weight.

3. Permanent writeback is prospective-only for scan dates >= 2026-10-09.
   No historical Apple Health backfill.

4. Trigger:
   automatic after canonical DEXA acceptance, with quiet status/retry.

5. Corrections:
   automatic replace of PhysiqueOS-owned HealthKit samples using versioned exact-once semantics.

6. Consent:
   one-time explicit opt-in + persistent You -> Apple Health toggle.
   Turning OFF stops future writes but does not auto-delete existing samples.

7. Physical pre-scan validation:
   use the Founder's REAL canonical 2026-09-12 DEXA.
   Do NOT fabricate a body-composition measurement.
   Temporarily authorize ONLY that canonical scan for the physical validation.
   Write its real Body Fat % and calculated fat-free Lean Body Mass.
   Verify source/provenance/timestamp/units/exactly-once/no feedback loop.
   Then delete both PhysiqueOS-owned samples and verify removal.
   Permanent policy remains prospective from 2026-10-09.

8. Other real historical DEXA figures may be used freely as deterministic/simulator test fixtures after the Sep 12 physical validation, but must NOT be written into the Founder's real Apple Health history unless separately authorized.

A. BASE / BRANCHING

Start from exact Native Build 83 source 3e61dd215e8474c52bd54230d2d9dfb2f3a93534.

This is a new post-Build-83 Native candidate. Use Build 84 as the expected next Native build number if/when a release candidate is produced.

Do not modify the Build 83 TestFlight authority.

Server work starts from exact production 89fe0a03.

Use isolated branches/worktrees.

B. SERVER WRITEBACK INTENT

Implement an additive Server-owned DEXA HealthKit writeback policy and intent projection.

Default deployment state:
DORMANT / disabled.

Policy must include:
- enabled/disabled;
- effectiveFromScanDate = 2026-10-09;
- allowed measurement kinds = bodyFatPercentage, leanBodyMassFatFree;
- prospective-only;
- no historical backfill;
- schema/version.

Intent source:
ONLY active canonical DEXA records in canonicalEvidenceObjects with valid dexaRevision/canonical identity.

Never derive from:
- extraction drafts;
- pending review;
- compatibility-only dexaScans seeds;
- HealthKit observations;
- historical seed rows without canonical identity.

Intent fields:
- canonical DEXA id / logical scan key;
- canonical revision;
- occurrence/scan date;
- measurement kind;
- canonical value in a stable Server unit;
- writeback schema version;
- desired state present/withdrawn;
- deterministic opaque sync identity material;
- time precision.

Do not expose sensitive values in logs.

C. TIMESTAMP SEMANTICS

Use actual canonical DEXA scan timestamp if known.

Current DEXA parser may have date only.

If only date is known:
- use a deterministic local date instant chosen by the accepted plan;
- mark metadata time precision = date;
- do NOT pretend confirmation/import time is scan time.

Audit current canonical occurrenceDate/timezone handling and implement one explicit rule.

If the Sep 12 canonical scan lacks exact time, physical validation must visibly retain date precision rather than fabricate an appointment time.

D. NATIVE HEALTHKIT WRITE TYPES

Add write authorization for EXACTLY:
- bodyFatPercentage;
- leanBodyMass.

Remove/keep bodyMass excluded from the active DEXA write scope.

Do not add body types to normal read/observer ingestion.

Do not add them to automatic foreground bootstrap authorization.

Explicit opt-in triggers the write-only HealthKit authorization sheet.

Update NSHealthUpdateUsageDescription to truthful DEXA-specific copy without implying Weight is written.

E. MAPPING

Body Fat:
- canonical percent 0-100 -> HK percent fraction 0-1;
- e.g. 8.1 -> 0.081.

Lean Body Mass:
- calculate fat-free mass = totalMass - fatMass;
- never raw canonical leanMass;
- write in an appropriate mass unit with exact conversion;
- validate consistency against canonical BF%/mass within accepted tolerances.

No:
- bodyMass;
- RMR/basalEnergyBurned;
- BMI;
- BMC;
- VAT;
- android/gynoid;
- regional mass;
- BMD/T/Z.

F. IDEMPOTENCY / EXACTLY ONCE

Implement deterministic identity per:
(canonical logical scan, measurement kind).

Use:
- HKMetadataKeySyncIdentifier;
- HKMetadataKeySyncVersion = canonical DEXA revision;
- HKMetadataKeyExternalUUID if appropriate and stable;
- minimal PhysiqueOS schema/kind/derivation/time-precision metadata.

Do not include owner id or PDF content in metadata.

Before saving:
query PhysiqueOS-owned samples by deterministic identity/source.

Cases:
- no sample -> save;
- same revision/value -> already_present, no save;
- higher canonical revision -> save replacement with higher sync version;
- desired withdrawn -> delete PhysiqueOS-owned sample;
- ambiguous/multiple own samples -> fail closed and surface diagnostic; do not compound duplicates.

Pin equal-sync-version behavior with a simulator/device integration test if possible; do not rely blindly on undocumented behavior.

G. WRITEBACK RECONCILER

HealthKit is device-local.

Implement Native reconciler:
Server intent -> local authorization -> own-sample reconciliation -> save/delete -> Server receipt.

Requirements:
- foreground-safe;
- survives app kill after HK save before receipt;
- retries on reconnect;
- offline = Pending;
- denied = Permission Needed;
- partial authorization per type;
- database inaccessible/locked = defer;
- no retry storm;
- no duplicate sample.

Server receipt/ledger stores:
- intent identity;
- canonical revision;
- measurement kind;
- outcome/status;
- opaque HealthKit correlation id if safe;
- timestamps/error code;
NO health value in logs.

H. FEEDBACK LOOP DEFENSE

PhysiqueOS-owned body samples must NEVER become new evidence/canonical body measurements.

Native:
- body types remain outside generic HealthKit observers/read registry;
- any future body query must exclude HKSource.default()/own source.

Server defense:
if a body quantity sample from a PhysiqueOS bundle is ever uploaded:
- source_only / neutralized;
- reason physiqueos_owned_writeback;
- never evidence eligible;
- never creates a DEXA intent;
- never affects Weight;
- never affects Confidence.

Test full loop:
DEXA accepted -> HK save -> simulated own sample observation -> ingestion -> zero canonical/evidence/intent recursion.

I. CORRECTIONS

Same-date corrected canonical DEXA:
- same logical scan;
- revision increments;
- new intent sync version;
- HealthKit replacement;
- exactly one own sample remains per kind.

If written field becomes unavailable:
- intent withdrawn;
- delete only PhysiqueOS-owned sample.

Date correction/supersede:
current product semantics may be incomplete.
Implement only if there is an existing safe canonical supersede path.
Otherwise fail closed/document operator path; do not invent destructive lineage semantics overnight.

Fix the audit's small web-discard guard if still valid:
confirmed review must not be relabeled discarded through the web path.
Keep it as a separate reviewed Server commit if practical.

J. UX

Add:
You -> Apple Health -> Save confirmed DEXA results toggle.

First opt-in:
PhysiqueOS explanatory sheet, then system HealthKit write authorization.

Copy should say:
Body Fat Percentage and Lean Body Mass are saved.
Weight and other DEXA results stay in PhysiqueOS.

DEXA detail/review result:
quiet status line:
- Saved
- Pending
- Permission Needed
- Failed

Retry for Pending/Failed/Permission where appropriate.

No success toast.

Turning toggle off:
- stops future writes;
- does NOT delete existing samples.

If product has room, add explicit separate "Remove PhysiqueOS DEXA data from Apple Health" action only if deletion can be implemented/tested safely; otherwise backlog it, do not block V1.

K. POLICY / EFFECTIVE DATE

Permanent policy stays disabled until physical validation succeeds.

Effective permanent date:
2026-10-09.

A DEXA with scan date >= 2026-10-09 can become eligible even if confirmed before/after Build 84 installation, once policy is enabled and Native reconciler runs.

No scan before Oct 9 is permanently eligible.

L. REAL SEP 12 PHYSICAL VALIDATION MODE

Implement a tightly bounded validation mechanism but DO NOT execute it overnight without Founder interaction/authorization.

It must:
- target only the exact canonical 2026-09-12 DEXA;
- require an explicit validation authorization/action;
- write exactly BF% + fat-free Lean Body Mass;
- use the real canonical values;
- write at the canonical scan date/time precision;
- verify exactly one own sample each;
- verify source = PhysiqueOS and metadata;
- verify no Weight sample;
- verify no feedback into PhysiqueOS;
- support deleting exactly those two own samples;
- verify deletion;
- leave permanent policy disabled/prospective Oct 9.

Fail closed if:
- Sep 12 canonical identity/revision differs from expected;
- more than one eligible scan;
- HealthKit permission incomplete;
- existing ambiguous own samples;
- any attempt would touch other Health data.

M. HISTORICAL REAL-VALUE TEST FIXTURES

Use real historical DEXA figures from existing trusted repo fixtures/canonical records as deterministic test inputs where helpful.

Do NOT fetch/write private production DEXA values unnecessarily.
Do NOT publish sensitive raw values in reports.
Do NOT write historical values to real Apple Health.

N. TESTS

Server:
- policy disabled;
- effective date;
- canonical-only intent;
- seed/compat rows excluded;
- mapping;
- revision;
- withdrawn;
- receipt idempotency;
- own-sample neutralization;
- no Weight;
- no historical intent;
- web discard guard;
- no strategic side effects.

Native:
Authorization:
- notDetermined;
- granted;
- denied;
- partial.

Mapping:
- BF percent fraction;
- fat-free lean calculation;
- units;
- missing values;
- no bodyMass.

Reconciliation:
- first save;
- already present;
- app killed after save before receipt;
- offline;
- locked;
- correction replacement;
- withdrawn delete;
- duplicate/ambiguous own samples fail closed;
- partial authorization;
- no retry storm.

Feedback:
- own source excluded;
- spoofed metadata from foreign bundle not trusted;
- no evidence/canonical/Weight/Confidence recursion.

Sep 12 validation:
- exact-scan guard;
- real-value fixture;
- exactly two writes;
- exactly two deletes;
- no Weight;
- permanent policy unchanged.

Regression:
- DEXA intake/review/confirm;
- HealthKit Activity/Cardio/Nutrition/Sleep;
- Weight;
- Build 83 Training/Watch/Live Activity;
- Home Widget;
- Progress Photos.

Full relevant Native and Server suites before release.

O. REVIEWS / GATES

Fresh independent Server review.
Fresh independent Native review.
Resolve all P0/P1/P2.

Deploy Server DORMANT only after tests/review.
No policy enable overnight.

If a production deploy requires Founder exact-SHA authorization under the guarded workflow:
STOP at exact reviewed SHA and publish checkpoint rather than waiting silently.

Native:
prepare Build 84 candidate only after green tests/review.

Do NOT upload TestFlight without explicit release authorization if required by release policy.
If the guarded uploader requires exact Build 84 authorization, stop with archive/candidate ready and publish the exact SHA.

P. PHYSICAL VALIDATION NEXT

The next Founder step after implementation should be:
1. install Build 84 from TestFlight;
2. opt in;
3. inspect system authorization sheet contains only Body Fat % + Lean Body Mass;
4. run the bounded Sep 12 real-scan write validation;
5. inspect Apple Health;
6. run bounded deletion;
7. verify samples gone;
8. enable permanent prospective policy effective Oct 9 only after successful physical acceptance.

Q. BUILD 83 INDEPENDENCE

Founder will test Build 83 in the gym tomorrow.

Do not alter/revoke Build 83.
Do not make DEXA Server changes break Build 83.
Server DEXA endpoints must be additive/backward compatible.

R. REPORTING

Publish early checkpoint after architecture/branch authority established.

Before every stop:
- push coherent work;
- publish report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report SHA.

Final/stop report must clearly state:
- Server SHA/deploy status;
- Native SHA/build/archive/TestFlight status;
- permanent policy enabled? expected NO;
- real Apple Health written? expected NO overnight;
- historical backfill? NO;
- Sep 12 validation ready? yes/no;
- exact Founder next action.

END TASK.
