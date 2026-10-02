HealthKit Sleep Evidence — production implementation of approved Recovery/Sleep UI

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Approved design:
agent-handoffs/reports/20261001T032718Z-healthkit-sleep-evidence-design.md

Visual prototype:
agent-handoffs/reports/20261001T040311Z-healthkit-sleep-evidence-visual-prototype.md

Historical shape:
agent-handoffs/reports/20260930T210326Z-healthkit-sleep-historical-shape-validation.md

Founder has visually approved the prototype direction: "Looks good to me in the UI front so far. Let's proceed."

PRODUCT DECISION

Recovery is the home for Sleep.

Historical Sleep Evidence should eventually be visible from the first date of consistent PhysiqueOS evidence, NOT from the earliest Apple Health Sleep record.

Codex is independently determining that PhysiqueOS boundary, deploying sleep-canon-v2, implementing the durable historical Evidence import, and implementing/confirming the Server Recovery/Sleep read-model contract.

Historical Sleep remains Evidence-only and permanently excluded from historical strategic artifacts.

Prospective Sleep remains strategically quarantined until:
- automatic sync is proven over the next few nights;
- Recovery Briefing card is designed/approved;
- Founder separately authorizes V3/Goal strategic graduation.

THIS TASK

Turn the approved visual prototype into a production-quality Native Recovery/Sleep Evidence implementation, but do not invent Server contract behavior. Coordinate to the documented contract and stop/report any mismatch.

Use real Server read models only in production authority.
Synthetic fixtures may remain Sandbox/test-only.

Preserve Founder Production cleanup candidate a5041eb0.

IMPLEMENTATION SCOPE

Implement the approved design in practical slices, preferably Slice 1 + Slice 2 if cleanly achievable:

Recovery hub row:
- existing Recovery row becomes real when Sleep data is available;
- Last night/date + total sleep summary;
- appropriate empty state pre-data.

Recovery landing:
- Last Night;
- 14-night total-sleep chart;
- trailing 7-night average;
- Sleep Window consistency card;
- Recent Nights + Show All;
- Data Sources.

Trends:
- range selector;
- Total Sleep + 7-night average;
- Sleep Window;
- Continuity;
- Stage Mix collapsed by default;
- paged/bounded night list.

Night detail:
- headline/date;
- total sleep;
- sleep window;
- hypnogram;
- stage composition;
- continuity;
- time in bed;
- additional sleep when present;
- Source & Data;
- timezone provenance;
- update/completeness state;
- algorithm version/provenance in collapsed detail.

Use sleep-canon-v2 stage/awake values only when Server marks them available.

Do not display v1 unreliable stage/Awake values.

TIMEZONE

Historical inferred timezone may be wrong during travel.
Founder specifically reports late-September Texas travel while validation showed one device-at-ingest zone.

UI must:
- label inferred timezone honestly;
- not imply inferred historical clock times are certain;
- visually mark inferred-zone nights as designed;
- avoid treating uncertain travel clock times as exact consistency evidence when Server flags them unsuitable.

TOTAL SLEEP remains valid independent of timezone display uncertainty.

NO STRATEGIC UI

Do not add:
- Goal weighting;
- Confidence;
- V3 interpretation;
- Briefing Recovery card;
- coaching recommendations;
- Sleep Score;
- good/bad labels;
- targets.

Future hooks remain only hooks.

FOAM ROLLING / BRIEFING FUTURE

Record but do not implement:
Recovery V1 strategic concept = Sleep + lightweight daily Foam Rolling execution.
Future Briefing Recovery card may reuse Sleep nightly graph + 7-day average and show lightweight foam-rolling execution.
Repeated misses only become narratively relevant with meaningful downstream context.
Sleep-training relationships are associations, not causation.

SERVER CONTRACT

Codex owns Server read-model implementation.

Before final integration:
- read Codex's current branch/report if available;
- use exact documented contract;
- do not create a competing Server implementation;
- if contract is not ready, implement Native models/adapters against a checked-in fixture protocol and stop before claiming integrated acceptance.

PERFORMANCE

Do not regress recent performance work.

Requirements:
- Recovery landing should be one bounded Server read;
- Trends bounded/ranged;
- night detail one scoped read;
- no broad all-history load for landing;
- charts use Server-derived aggregates where specified;
- pagination for long night history;
- caching consistent with Evidence read behavior;
- fail-soft Evidence Hub semantics preserved if/when performance candidate is integrated later.

PROTOTYPE TO PRODUCTION

Remove/non-ship prototype launch argument behavior from production implementation path.

Production must never use synthetic fixture data.

Sandbox may retain explicit fixture support if clearly isolated and useful for tests.

ACCESSIBILITY

Preserve approved accessibility design:
- AX chart descriptors;
- readable row labels;
- dynamic type;
- 44pt targets;
- stage distinction not color-only.

TESTING

At minimum:
- decode/read-model tests;
- Recovery landing states;
- 7-day average/chart;
- inferred timezone;
- pending correction;
- no data;
- updating;
- stages available/absent;
- secondary sleep;
- Trends range behavior;
- Night detail;
- navigation Hub -> Recovery -> Night;
- production cannot load fixtures;
- Founder Production cleanup preserved;
- existing Evidence destinations regressions.

Release compile.
Risk-scaled broader Native suite if resources permit.
No TestFlight upload without separate authorization unless Codex's integrated rollout task explicitly coordinates the exact candidate.

BRANCH / INTEGRATION

Create a production implementation branch based on current accepted Native authority plus a5041eb0 cleanup, not on the non-shipping prototype branch blindly.

Port reviewed components deliberately.

Do not merge Codex Server changes into Native.

If a new integrated Build 74 candidate becomes appropriate, publish exact integration instructions rather than uploading independently.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-healthkit-sleep-evidence-native-implementation.md

Include:
- branch/SHA/base;
- prototype-to-production differences;
- Server contract dependency/status;
- implemented screens;
- timezone handling;
- v2 gating;
- tests/build;
- performance considerations;
- Founder cleanup preservation;
- strategic status OFF;
- upload status;
- exact integration/next step.

Publish GH checkpoint before every stop.

END TASK.
