Sleep v3 — Oct 3 morning canary read-only audit

TASK TYPE

Codex bounded production read-only audit.

Founder is physically viewing the current Sleep/Recovery detail on installed Build 84.

DO NOT patch.
DO NOT mutate production.
DO NOT alter Sleep policy.
DO NOT backfill/recalculate.
DO NOT finalize the night early.
DO NOT change Native.
Only recommend a patch if a real discrepancy is proven.

CURRENT FOUNDER UI OBSERVATION

Night label:
Night of Sat, Oct 3

Headline:
7h 36m asleep

Window:
11:17 PM - 8:02 AM PDT

UI says:
Still updating until 6:00 PM

Stages:
Deep 1h 30m
Core 4h 11m
REM 1h 56m
Awake in sleep window 1h 09m

Continuity:
Longest continuous asleep 1h 16m
Awake in window 1h 09m between sleep

Time in Bed:
9h 25m

Source:
Counted from Oura (via Apple Health)

Timeline renders full Awake/REM/Core/Deep stages.

Note:
Displayed stage totals sum to 7h37m while headline displays 7h36m. This may be independent display rounding and is NOT assumed to be a defect.

READ FIRST

Current production authority from latest DEXA release report:
agent-handoffs/reports/20261003T153612Z-dexa-healthkit-server-deployed-build84-valid.md

Sleep v3 implementation/activation reports and latest Sleep canary reports. Search agent-handoffs/reports for sleep-v3 / sleep canon / canary.

Mandatory production read-only access instructions and GH checkpoint protocol.

A. AUTHORITY

Reverify:
- exact production Server SHA/deployment;
- Sleep v3 policy/version;
- Native Build 84 read compatibility;
- no unexpected Sleep deployment/config change since last accepted canary.

B. BOUNDED PRODUCTION READ-ONLY NIGHT CAPTURE

Use approved least-privilege production path.

Requirements:
- exact runtime SHA gate;
- BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
- verify transaction_read_only=on;
- bounded Founder-owner SELECTs;
- ROLLBACK;
- no secrets;
- no raw private sleep export in GH.

Locate the current Oct 3 night/canonical Sleep record and its source observations.

Verify:
- algorithmVersion expected sleep-canon-v3;
- night key/date;
- timezone;
- provisional/finalization state;
- update-until/finalization deadline;
- source device/app provenance;
- Oura via Apple Health selection;
- ordinary vs historical namespace;
- canonical id/revision;
- observation count/revision if useful.

C. STAGE ARITHMETIC

Using exact canonical stage intervals/durations privately, recompute:

- Deep duration;
- Core duration;
- REM duration;
- asleep duration;
- Awake-in-window duration;
- sleep-window duration;
- time-in-bed duration.

Compare exact underlying values with displayed rounded:
Deep 1h30
Core 4h11
REM 1h56
Asleep 7h36
Awake 1h09
Time in Bed 9h25

Specifically explain whether:
Deep + Core + REM displayed = 7h37
while headline = 7h36
is expected independent rounding from exact seconds/minutes.

Pass if exact arithmetic is internally consistent and display behavior matches formatting rules.

D. CONTINUITY DERIVATION

Privately recompute longest continuous asleep from canonical stage intervals.

Expected UI:
1h16m

Prove:
- exact interval start/end/duration;
- what breaks continuity (Awake only? gaps? in-bed? source transitions?);
- no accidental break from adjacent asleep-stage changes such as Deep -> Core or Core -> REM;
- no source-boundary artifact.

Do NOT publish sensitive raw interval timestamps beyond what Founder already supplied unless necessary; report duration and derivation result.

E. TIME IN BED

Verify why Time in Bed = 9h25 while headline sleep window shown 11:17 PM-8:02 AM is 8h45 clock time.

Determine exact semantics:
- source in-bed samples extending beyond stage window;
- canonical bed interval;
- multiple in-bed segments;
- other intended derivation.

This is important: do not assume 9h25 is correct merely because it renders.

If the semantics are intended, explain the distinction clearly.
If 9h25 is inconsistent with canonical/source data, flag it.

F. PROVENANCE

Verify UI statement:
Counted from Oura (via Apple Health)

Prove selected source/source bundle/device is Oura through HealthKit and no Apple Watch/Oura double-counting occurs.

G. PROVISIONAL / FINALIZATION

At morning check-in UI says updating until 6 PM.

Verify:
- night is correctly provisional;
- late-arriving Oura/HealthKit samples can still revise it;
- finalization occurs at intended local 6 PM boundary;
- no early strategic interpretation treats provisional values as immutable if policy says otherwise.

Do not finalize early.

H. STRATEGIC/HISTORICAL ISOLATION

Verify this prospective Oct 3 Sleep v3 night:
- does not rewrite historical briefings;
- does not rewrite historical Confidence/Narrative/recommendations;
- historical Sleep import namespace remains isolated;
- prospective evidence behavior is as designed;
- no DEXA/Build83/Cardio side effects.

I. VERDICT

Return one:
PASS — current morning canary internally correct;
PASS WITH DISPLAY NOTE — arithmetic correct but explain independent rounding/Time in Bed semantics;
INVESTIGATE — proven discrepancy;
FAIL — canonical or strategic invariant broken.

Do not patch automatically.

If a real defect is found:
publish exact evidence and minimal proposed patch, then STOP for Founder decision.

J. EVENING CHECK

Prepare a concise post-6PM acceptance checklist:
- finalized state;
- final revision;
- stage totals;
- continuity;
- provenance;
- no unexpected post-finalization mutation.

Do not create an automation; Founder will manually check later.

K. REPORT

Publish:
agent-handoffs/reports/<timestamp>-sleep-v3-oct3-morning-canary-audit.md

Update latest pointers.

Follow mandatory GH-main protocol:
- publish;
- fetch/reverify main;
- re-read exact report;
- give exact main report SHA.

END TASK.
