HealthKit Sleep Phase C — authorize D0, Oura preference, and 30-night historical validation only

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Latest Phase C report:
agent-handoffs/reports/20260930T201251Z-healthkit-sleep-phase-c-dormant-deploy-build73.md

CURRENT ACCEPTED STATE

Production Server:
08aeecdeb9f02e311efa2cd037940fbf0b249bb7

Build 73:
0591267480a4e1ece98e7855ecaecfdbb4dc8944
TestFlight VALID.

Dormancy acceptance passed:
- prospective Sleep ingestion disabled;
- historical validation disabled;
- zero Sleep samples/days/validation samples;
- zero strategic leakage.

FOUNDER DECISIONS

Prospective D0 anchor:
2026-10-01 sleep day

Time zone:
America/Los_Angeles

Founder source preference:
Oura, through the generic reviewed source-preference policy.

Historical validation window:
2026-09-01 through 2026-09-30 inclusive, exactly 30 sleep days immediately preceding D0.

IMPORTANT:
This authorization DOES NOT activate prospective Sleep ingestion yet.

The purpose of D0 in this operation is to anchor the historical window and prepare the future prospective boundary.

AUTHORIZED OPERATIONS

1. Reverify exact Server authority 08aeecde, health, Build 73 validity, dormancy counts, and policies absent/off.

If authority changed materially, stop/report.

2. Build and dry-run the guarded policy operations for:
- set-source-preference = Oura;
- open-historical-validation with effectiveSleepDay 2026-10-01, America/Los_Angeles, window 2026-09-01 through 2026-09-30.

Verify:
- historical window is exactly 30 sleep days;
- it ends before D0;
- historical validation is structurally isolated;
- prospective activation remains OFF;
- strategic evidence remains quarantined;
- no ordinary Sleep sample/day records are created by opening the window.

3. Apply only:
- Oura source preference;
- historical validation window.

Do NOT run activate-prospective.
Do NOT create the ordinary prospective activation policy.
Do NOT add Sleep to evidence eligibility/readiness/V3/Briefings.

4. Post-operation verification:
- source preference record = Oura via generic policy;
- historical validation capability enabled for exact bounded window;
- prospective Sleep ingestion capability still disabled;
- operational Sleep ingest still returns expected disabled response;
- ordinary healthKitSleepSamples = 0;
- ordinary healthKitSleepDays = 0;
- validation samples remain 0 until Founder runs the device diagnostic;
- strategic leakage = 0.

5. FOUNDER ACTION HANDOFF

After the Server window is open, publish a GH checkpoint and give the Founder the exact minimal Build 73 tap sequence.

Expected conceptual flow:
- install/open Build 73;
- navigate to the Founder HealthKit/Sleep diagnostic surface;
- enable the existing Founder canary if required;
- request HealthKit authorization if required;
- Check Server window;
- Run historical Sleep validation.

But use the exact labels/paths from Build 73 source. Do not make Founder infer them.

The Founder should not need:
- Mac access;
- terminal;
- PAT;
- pairing/re-pairing;
- Face ID;
- Health export;
- manual entry of sleep data.

If HealthKit Sleep read permission was previously denied, report the exact iOS Settings/Health action needed; do not claim zero data means no Sleep exists.

6. STOP after publishing the exact Founder action.

Do not remotely invoke the historical read without the Founder initiating the diagnostic on the physical iPhone.

7. After Founder reports the historical validation completed, continue:
- verify validation samples only in the isolated validation collection;
- run zero-write historical-shape audit;
- canonicalize in memory using sleep-canon-v1;
- verify Oura primary when technically usable;
- verify fallback behavior;
- verify no double counting;
- validate totals/stages/awake/inBed/main-secondary/date attribution/source overlap;
- produce sanitized real-data shape only;
- no raw Founder Sleep records/timestamps/stages in GH;
- prove ordinary Sleep samples/days remain zero;
- prove strategic leakage remains zero.

8. Publish the Sleep Evidence-design handoff for a separate Claude design task.

That handoff should contain:
- canonical schema;
- sanitized 30-night data shape;
- field availability/completeness;
- source overlap/fallback patterns;
- representative synthetic/redacted examples;
- product purpose: Sleep evidence for physique/recovery coaching, not a standalone sleep tracker;
- strategic weighting and Briefing integration explicitly undecided.

Do NOT design/implement the Evidence UI in this operation.

PROSPECTIVE SLEEP

D0 is now reserved as 2026-10-01, but prospective activation remains OFF until a separate explicit Founder authorization.

If historical validation extends beyond the prospective floor or the future-floor guard makes 2026-10-01 invalid by the time activation is requested, stop and propose the next clean prospective D0 rather than weakening the guard.

REPORTING

Checkpoint before every stop.

First checkpoint after opening the window must include:
- exact Server authority;
- source-preference state;
- historical window;
- prospective activation state = OFF;
- zero ordinary Sleep counts;
- exact Build 73 Founder tap sequence.

END AUTHORIZATION.
