DEXA -> Apple Health writeback — architecture/status audit and implementation decision plan

TASK TYPE

Claude comprehensive audit + implementation plan.

Founder has a DEXA scheduled Friday 2026-10-09 and wants PhysiqueOS write-to-HealthKit ready for that scan.

This may require Founder product/authority decisions.

DO NOT implement or deploy writeback in this task.
DO NOT write any HealthKit samples.
DO NOT mutate production DEXA data.
DO NOT backfill historical scans.
DO NOT create a Native build.

READ FIRST

Durable backlog:
agent-handoffs/backlog/PHYSIQUEOS_PRODUCT_BACKLOG.md

Find/read all relevant:
- Native DEXA PDF intake/review/confirmation reports;
- DEXA canonical Server model/read/write reports;
- HealthKit architecture and ingestion reports;
- HealthKit source observation -> canonical PhysiqueOS record -> evidence eligibility separation;
- HealthKit Activity/Nutrition/Cardio/Sleep write/read architecture;
- existing HealthKit permissions/capabilities;
- Build 82 / current Native authority;
- historical DEXA authorities and canonical scan handling.

GH protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

CURRENT GOAL

By the Oct 9 DEXA, Founder should ideally be able to:

DEXA PDF/intake -> PhysiqueOS review/confirmation -> canonical DEXA accepted -> appropriate body-composition measurements written to Apple Health exactly once with PhysiqueOS provenance.

The writeback must not:
- create duplicate PhysiqueOS evidence when our own HealthKit writes are re-observed;
- overwrite unrelated Health data;
- misrepresent DEXA measurements as scale measurements;
- create feedback loops;
- silently write uncertain/extracted-but-unconfirmed values;
- rewrite historical HealthKit without explicit Founder authorization.

A. CURRENT DEXA FLOW AUDIT

Map exact current end-to-end flow:

1. DEXA PDF/image intake;
2. document detection/classification;
3. extraction;
4. Evidence Review;
5. Confirm/Correct/Dismiss;
6. canonical DEXA persistence;
7. DEXA Evidence UI;
8. Goal/body-composition interpretation;
9. current DEXA fields and units;
10. correction/update semantics;
11. duplicate scan handling;
12. historical DEXA imports;
13. any server/client ownership split.

Identify the exact canonical "accepted" point after which HealthKit writeback could safely occur.

B. CURRENT HEALTHKIT BODY-COMPOSITION STATUS

Audit Native entitlements/authorization/read/write types.

Determine whether PhysiqueOS currently requests read and/or write authorization for:
- bodyMass;
- bodyFatPercentage;
- leanBodyMass;
- height;
- BMI;
- any other body-composition type.

Identify:
- which are currently read;
- which are ingested/canonicalized;
- whether Weight already comes from HealthKit;
- source filtering/provenance;
- whether any PhysiqueOS body measurements are currently written to HealthKit;
- whether current Info.plist usage descriptions cover writing;
- whether new permissions will trigger a user authorization sheet.

C. APPLE HEALTH DATA-TYPE MAPPING

For every canonical DEXA measurement, determine whether Apple Health has an appropriate writable HealthKit quantity type.

Audit at minimum:
- total body weight / body mass;
- body fat percentage;
- lean body mass;
- bone mineral content/mass;
- visceral fat / VAT;
- android/gynoid fat;
- regional lean/fat mass;
- RMR/BMR;
- BMI;
- any other DEXA values PhysiqueOS stores.

For each:
- exact HKQuantityTypeIdentifier if available;
- writable or read-only;
- expected unit;
- whether DEXA value maps semantically without distortion;
- whether Apple Health UI actually surfaces it usefully;
- whether it should be in V1.

Do not invent mappings for measurements Apple Health does not represent.

D. SOURCE-OF-TRUTH / SEMANTIC DECISIONS

Founder likely needs decisions.

Evaluate recommended V1 write set.

Potential core candidates:
- bodyMass;
- bodyFatPercentage;
- leanBodyMass.

For each, answer:

1. Should DEXA total mass be written as Body Weight?
   Consider that Founder also has daily scale weights and DEXA scale is historically different.
   Would writing DEXA body mass create a second weight datapoint on scan day and distort daily Weight trends?
   Can Apple Health source priority distinguish it cleanly?
   Should PhysiqueOS intentionally NOT write DEXA total mass to Body Weight?

2. Body Fat Percentage:
   DEXA is likely a high-quality measurement.
   Should accepted DEXA BF% be written at scan timestamp?
   How does this coexist with smart-scale BF% if present?

3. Lean Body Mass:
   likely semantically appropriate.
   Verify Apple's definition/unit and whether DEXA lean mass excludes BMC in the same way expected by HealthKit.
   DEXA total = fat + lean + BMC. Apple Health lean body mass semantics may not equal DEXA soft-tissue lean mass.
   This is a critical semantic audit; do not assume equivalence.

4. Bone mass:
   determine whether Apple Health exposes a writable type. If not, keep PhysiqueOS-only.

5. RMR/BMR:
   determine whether a DEXA-provided/derived RMR belongs in Apple Health Basal Energy or any other type. Strongly distinguish a rate estimate from daily energy quantity. Do not map if semantically wrong.

Give a recommended V1 set and alternatives, but explicitly flag decisions Founder must make.

E. TIMESTAMP SEMANTICS

Determine the timestamp to use for HealthKit samples:
- actual DEXA scan timestamp if known;
- canonical occurrenceDate;
- confirmation time;
- import time.

Recommend scan timestamp.

Handle:
- date known but exact time unknown;
- timezone;
- corrected scan date;
- PDF imported days later.

Never use import/confirmation time if scan time is known and doing so would misrepresent measurement timing.

F. WRITE TRIGGER

Evaluate options:

1. Native writes immediately after Founder confirms DEXA.
2. Server records a pending HealthKit-write instruction and Native performs it.
3. Native observes canonical accepted DEXA and writes idempotently.
4. Manual "Save to Apple Health" action after confirmation.
5. Hybrid automatic + visible status/retry.

Recommend architecture consistent with HealthKit's device-local authorization model.

HealthKit writes must occur on an authorized Apple device; Server cannot directly write to Apple Health.

Define behavior when:
- DEXA confirmed on Native;
- DEXA confirmed from web/other surface;
- phone offline;
- Health permission denied;
- app killed before write;
- write fails;
- later retry.

G. IDEMPOTENCY / PROVENANCE

Design exact-once logical write behavior.

Need a durable link between:
canonical DEXA scan id
and
HealthKit sample UUID(s).

Audit whether HKMetadataKeyExternalUUID or custom metadata can carry the canonical DEXA id.

Recommended principles:
- deterministic external/correlation id per DEXA measurement;
- metadata indicating PhysiqueOS + canonical DEXA id + measurement kind + schema version;
- local/server write ledger if needed;
- repeated confirmation/retry must not create duplicates;
- if HealthKit save succeeds but acknowledgement fails, retry must detect existing sample rather than write another.

Define source bundle validation when our own samples are re-read.

H. FEEDBACK-LOOP / REINGESTION PREVENTION

Critical.

PhysiqueOS may observe its own HealthKit samples later.

Design how ingestion recognizes:
- source bundle = PhysiqueOS;
- external/correlation metadata;
- DEXA canonical id.

Our own writeback must NOT:
- create a new generic body-composition Evidence object;
- alter daily Weight incorrectly;
- trigger duplicate DEXA evidence;
- recursively request another HealthKit write;
- affect Confidence twice.

Determine whether to:
- ignore our own samples entirely in generic ingestion;
- ingest as linked observation but suppress evidence;
- reconcile to existing DEXA scan.

Recommend one.

Test loop:
DEXA accepted -> HK save -> observer wakes -> PhysiqueOS ingest -> no duplicate canonical/evidence/write.

I. CORRECTIONS / DELETE-REPLACE

Founder can Correct DEXA data.

Decide behavior if accepted DEXA values are corrected AFTER HealthKit write.

Options:
- delete PhysiqueOS-owned old sample(s) and write corrected samples;
- leave historical sample and write correction;
- require manual confirmation.

Audit HealthKit deletion rules:
- app may delete samples it owns;
- cannot delete other apps' samples.

Design deterministic correction behavior.

Also handle:
- DEXA Dismiss after write;
- duplicate PDF later recognized as same scan;
- canonical scan merged/superseded;
- scan deleted if product supports it.

J. HISTORICAL DEXA

No historical HealthKit backfill is authorized by default.

Audit existing 15/15 historical canonical DEXA PDFs/scans.

Present options:
- prospective-only starting Oct 9;
- bounded backfill of canonical DEXA BF% etc;
- no backfill ever.

Recommend prospective-only for V1 unless strong reason otherwise.

Do not perform any backfill in this task.

K. DAILY WEIGHT INTERACTION

This is a Founder-specific product concern.

PhysiqueOS daily Weight and DEXA total mass are different measurement contexts.

Audit:
- current Weight canonical source;
- HealthKit Weight ingestion;
- whether a DEXA-written bodyMass sample would appear in daily Weight;
- same-day multiple samples;
- source priority;
- Home/Goal/Briefing implications.

Recommend whether DEXA bodyMass should be excluded from HealthKit writeback to avoid contaminating daily scale trends.

L. APPLE HEALTH UX

Plan:
- authorization copy;
- DEXA confirmation UI status:
  Apple Health: Saved / Pending / Permission Needed / Failed;
- retry action;
- optional settings toggle if warranted;
- no noisy confirmation for every successful future scan if automatic behavior is accepted.

Decide whether Founder should be asked once:
"Save confirmed DEXA body composition to Apple Health"

or whether this is an app-level setting.

M. SECURITY / PRIVACY

- no HealthKit data written from Server;
- no sensitive values in logs;
- metadata minimal;
- no raw PDF content in HealthKit metadata;
- HealthKit permissions least-privilege;
- no background write attempts without canonical accepted data.

N. TEST PLAN

Design deterministic tests:

Authorization:
- granted;
- denied;
- notDetermined;
- partial type authorization.

Write:
- first save;
- retry;
- app killed after HK save before ledger ack;
- offline Server;
- duplicate confirmation;
- exact same DEXA reimport;
- correction;
- dismiss;
- delete/supersede;
- date/time correction.

Mapping:
- units;
- BF fraction vs percentage;
- lb/kg;
- lean-mass semantics;
- unavailable field.

Feedback:
- own sample observed;
- source metadata missing;
- spoofed external id from another bundle;
- no duplicate evidence;
- no recursive write.

Weight:
- same-day scale + DEXA if bodyMass included;
- prove chosen policy.

Historical:
- no pre-effective-date write.

O. CURRENT BUILD / DELIVERY

Audit where this should land relative to:
- Build 82 Watch physical acceptance;
- next Native build number;
- Server changes if needed.

Founder needs feature ready before Friday Oct 9.

Recommend a schedule with:
Phase A decision;
Phase B implementation;
Phase C sandbox/synthetic DEXA validation;
Phase D physical Apple Health verification before Oct 9;
Phase E real Oct 9 scan acceptance.

Do not implement in this audit.

P. FOUNDER DECISIONS

End with a concise decision table containing ONLY choices genuinely requiring Founder input.

Likely:
1. Which DEXA measurements to write.
2. Whether DEXA body mass should write to Apple Health Weight.
3. Prospective-only vs historical backfill.
4. Automatic after confirmation vs manual Save to Apple Health.
5. Correction policy if already written.
6. Any setting/toggle preference.

For each:
- recommended option;
- alternative;
- consequence.

Q. REPORT

Publish:
agent-handoffs/reports/<timestamp>-dexa-healthkit-writeback-audit-plan.md

Update durable backlog:
- DEXA HealthKit writeback due before Oct 9;
- audit result;
- Founder decisions pending;
- implementation not started.

MANDATORY GH PROTOCOL

Before stopping:
- publish report to origin/main;
- update latest pointers;
- fetch/reverify main;
- re-read exact report;
- provide exact main report commit SHA.

END TASK.
