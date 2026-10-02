HealthKit Sleep Evidence Native — reconcile to live Server contract and prepare integrated build

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Claude Native implementation:
agent-handoffs/reports/20261001T044541Z-healthkit-sleep-evidence-native-implementation.md

Codex verified import / Oct 2 activation:
agent-handoffs/reports/20261001T061329Z-sleep-historical-import-verified-prospective-d0.md

Approved design:
agent-handoffs/reports/20261001T032718Z-healthkit-sleep-evidence-design.md

Visual prototype:
agent-handoffs/reports/20261001T040311Z-healthkit-sleep-evidence-visual-prototype.md

CURRENT AUTHORITIES

Production Server:
b81c784e5b8a6d5b82ed02a649b5fa3d0edeeff8

Native Build 74 authority:
b6d98889a9ebac2fd6755ec126c1b5ba394545fa

Claude Sleep UI candidate:
d550c629e6028fef2db44e98cd51f2a4d2d6ff2

Historical Sleep:
8601 samples, 87 canonical historical Evidence nights, 2026-07-06 through 2026-09-30, sleep-canon-v2, permanently strategically quarantined.

Prospective Sleep:
D0 2026-10-02, validation_only, Oura preferred, enabled.
Strategic Sleep remains OFF.
Empirical 2-3-night background acceptance is pending.

PURPOSE

Reconcile the already-approved Native Recovery/Sleep UI to the ACTUAL live Server contract, perform real Founder Production read acceptance against the 87-night historical dataset, and prepare the next integrated Native build candidate.

This is NOT a redesign.

Do not modify the Server contract merely to match Claude's earlier proposal unless a genuine Server defect is found. Adapt Native to the live contract where semantically equivalent.

Do not change prospective Sleep activation.
Do not manually ingest prospective Sleep.
Do not enable V3/Goals/Briefings/Confidence.
Do not implement Recovery Briefing card yet.
Do not touch Workout Logger Live Activities.

A. BASE / INTEGRATION

Start from current Build 74 Native authority b6d98889, which includes:
- accepted automatic Sleep plumbing;
- historical importer;
- Founder Production cleanup;
- persistent pairing;
- existing graduated HealthKit behavior.

Integrate the approved Sleep Evidence UI from d550c629 deliberately.

Do not blindly merge the non-shipping prototype branch.

Preserve Build 74 behavior exactly outside Recovery/Sleep Evidence.

B. LIVE CONTRACT RECONCILIATION

Use the exact field-level differences documented by Codex.

Live resources:
- recovery-sleep-landing
- recovery-sleep-trends with required startDate/endDate and optional limit/cursor
- recovery-sleep-night scoped by sleepDay
- paged nights are returned through trends; there is no separate recovery-sleep-nights endpoint

Adapt Native primarily in:
- RecoverySleepReadModel.swift
- RecoverySleepAPI.swift
- fixture generator / fixtures
- tests as required

Do not force Server to reproduce the obsolete proposal.

Map live shapes correctly:

Landing:
- schemaVersion
- lastNight
- nights
- sevenNightAverage {seconds, nightCount}
- window {medianStartMinute, medianEndMinute, startSpreadMinutes, endSpreadMinutes, nightsUsed, inferredNightsExcluded}
- label-only sources
- strategicUse

Trends:
- range {startDate,endDate}
- granularity
- series
- nights
- page
- strategicUse

Night:
- flat projected night
- mainSleep
- sleepWindow
- timeline
- stageStatus
- stages
- continuity
- timeInBedSeconds
- secondarySleep
- label sources
- completeness
- timezone basis/uncertainty
- algorithm/provenance

Origin mapping must tolerate:
- historical_evidence_import
- validation_only
- future unknown values

Stage mapping:
live Server currently uses available/unavailable.
Never show stage/Awake/continuity numbers unless Server says available.
Keep Native tolerant of future pending/unknown states.

C. RANGE / PAGING

Translate UI selectors:
2W / 1M / 3M / 6M / All
into explicit bounded startDate/endDate queries.

All must be bounded by the Evidence start/current available range; never issue an unbounded all-history query.

Use Server weekly granularity for long ranges.

Show All/history paging must consume the page/cursor from recovery-sleep-trends.

No duplicate nights across pages.

D. REAL FOUNDER PRODUCTION READ ACCEPTANCE

After integration, use the actual Founder Production authority/read path against b81c784e.

This is read-only acceptance.

Verify:
1. Evidence Hub Recovery row becomes real rather than Coming soon.
2. Recovery landing decodes and renders the real 87-night history.
3. Last Night/7-night average/14-night chart render.
4. Sleep Window respects Server inclusion/exclusion and uncertainty.
5. Recent Nights and Show All page correctly.
6. Trends 2W/1M/3M/6M/All decode.
7. Long range uses weekly points.
8. A real historical night detail decodes:
   - sleep-canon-v2;
   - stages available;
   - timeline;
   - continuity;
   - time in bed if present;
   - provenance historical_evidence_import;
   - strategicUse quarantined;
   - timezone uncertainty.
9. No raw private values are written to GH reports/screenshots.
10. Historical and prospective origins can coexist without duplicate UI rows once prospective data arrives.

Do not mutate Sleep data during read acceptance.

E. UI PRESERVATION

Preserve the Founder-approved visual direction:
- Recovery home;
- Last Night;
- 14-night Sleep chart + 7-night average;
- Sleep Window;
- Recent Nights;
- Data Sources;
- Trends;
- hypnogram;
- stages;
- continuity;
- time in bed;
- additional sleep;
- source/provenance;
- timezone uncertainty.

Do not add a Sleep Score.
Do not add good/bad judgments or targets.

Historical uncertain clock times:
- total sleep remains usable;
- clock time must be marked uncertain/approximate according to Server facts;
- excluded nights must not silently enter consistency calculations.

F. EMPIRICAL OCT 2 CANARY

Do not manufacture acceptance.

The Oct 2 prospective policy is already enabled validation_only.

Native integration must preserve the automatic observer path.

If a prospective Oct 2 record exists naturally by the time this task runs, READ it and verify it renders correctly, but do not require it and do not manually trigger ingestion.

The 2-3-night empirical acceptance remains a separate ongoing gate.

G. FOUNDER PRODUCTION CLEANUP / GENERATOR DRIFT

The Live Activities discovery found generate_project.py is missing three Sleep files that were hand-added to the committed pbxproj.

As the Sleep-lane owner, fix this generator drift in this task before handing authority to the Live Activities project.

Requirement:
- incorporate all currently accepted Sleep files into generate_project.py;
- regenerate;
- prove generated pbxproj matches intended committed project with no dropped accepted files;
- no unrelated target/project churn;
- document exact fix for Live Activities Phase 0.

This is important because the next project will add a Widget Extension and must be able to regenerate safely.

H. TESTING

Required:
- production decoder fixtures generated from the live schema shape, sanitized/synthetic;
- landing decode;
- trends decode for all ranges/granularity;
- pagination;
- night detail;
- unknown enum tolerance;
- stage available/unavailable;
- timezone uncertainty;
- historical origin;
- validation_only origin;
- strategicUse quarantined;
- no-data;
- updating/completeness states;
- secondary sleep;
- Evidence Hub fail-soft;
- authority switch;
- production can never use fixtures;
- Founder Production cleanup;
- existing Evidence destinations;
- automatic Sleep coordinator regression;
- historical import regression;
- persistent pairing regression if shared networking/project files change.

Run fresh review.

Run Release compile.

Run full Native suite if resource/disk permits; otherwise risk-scaled suites with explicit reason.

I. BUILD NUMBER / TESTFLIGHT

Do not assume Build 75 until exact current upload authority is reverified.

If integration and fresh review are clean:
- select next available build number;
- archive through Xcode;
- upload through Xcode/release tooling only;
- never log into App Store Connect/Developer in browser;
- if Xcode requires Apple re-auth/2FA, stop and tell Founder;
- wait for VALID.

This authorization is for the integrated Sleep Evidence build only.

Do not bundle Workout Live Activities.

J. FOUNDER ACCEPTANCE

After VALID, publish the exact minimal Founder acceptance flow:
- install build;
- Evidence -> Recovery;
- inspect landing;
- Trends;
- one historical night detail;
- confirm historical range reaches July 6;
- confirm no obvious timezone/travel misrepresentation.

Do not ask Founder to manually trigger prospective Sleep.

K. STRATEGIC STATUS

Must remain OFF throughout:
- V3
- Goal Confidence
- Strategy Confidence
- Goals
- Briefings
- Narrative
- recommendations

No Recovery Briefing implementation yet.

L. REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-evidence-integrated-native.md

Include:
- exact base/candidate SHA;
- live Server contract reconciliation;
- real read acceptance results;
- generator drift fix;
- tests/build/review;
- TestFlight build/status if uploaded;
- Founder acceptance steps;
- Oct 2 canary status if naturally observable;
- strategic status OFF;
- local-only state.

Publish GH checkpoint before every stop.

END TASK.
