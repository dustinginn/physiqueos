PhysiqueOS HealthKit Sleep — 3-night acceptance audit and conditional V3 graduation

TASK TYPE

NEW Claude Remote Control chat.
Use High reasoning.
Separate workstream from the existing Build 86 Watch/HealthKit integration chat.

GOAL

HealthKit Sleep has now had three completed Founder nights of prospective data. Audit those three nights end to end. If and only if the data quality, canonicalization, provenance and strategic semantics are sound, graduate Sleep prospectively into the V3 Confidence/Narrative evidence pipeline.

Do not wait for an arbitrary 6 PM boundary merely to begin the audit. Use authoritative observation dates/timestamps and current server time. If today's/night's data is still incomplete, exclude that incomplete interval and evaluate the three completed nights only.

ARCHITECTURAL RULE

Keep these layers explicitly separate:

HealthKit source observation
→ canonical PhysiqueOS Sleep/Recovery observation
→ evidence eligibility
→ V3 Confidence/Narrative interpretation.

Ingestion/provenance must never itself decide that sleep is strategically meaningful evidence.

Do not couple Sleep to Confidence merely because HealthKit ingestion exists.

HISTORICAL SAFETY

This work is prospective.

Do NOT:
- rewrite historical Briefings;
- recompute historical Goal confidence;
- recompute historical Strategy confidence;
- rewrite historical Narrative;
- rewrite historical recommendations;
- alter historical strategic artifacts.

If any pre-start historical Sleep exists for design/validation, it remains observational only unless separately authorized.

Reverify the Founder-approved HealthKit Sleep start boundary from current authority. Do not infer or widen it.

PART A — CURRENT AUTHORITY

Reverify:
- current production Server/deployment/schema authority;
- current HealthKit ingestion policy/version;
- current Sleep canonical model;
- current evidenceEligibility domains/policy version;
- current V3 Confidence/Narrative model and policy authority;
- current HealthKit Sleep start boundary;
- any existing Sleep-specific tests/backlog/ledger entries.

Review the HealthKit architecture and the prior Cardio V3 graduation as the closest precedent, but do not mechanically copy Cardio semantics.

PART B — THREE-NIGHT PRODUCTION AUDIT

Using approved read-only production access, inspect the three completed Founder nights since Sleep prospective activation.

Use bounded owner-scoped SELECTs only under BEGIN READ ONLY and verify transaction_read_only = on.

For each completed night determine:
- observation date/night identity;
- source/device/provenance;
- sleep start/end window;
- total sleep duration;
- time in bed if available;
- awake/core/deep/REM durations if available;
- overlapping/duplicate Apple Health samples;
- whether multiple devices/sources contributed;
- canonical reconciliation behavior;
- missing stages;
- impossible/negative durations;
- stage totals versus sleep window;
- timezone/day-boundary handling;
- late-arriving updates;
- whether the night is final enough for strategic interpretation;
- whether the canonical record is stable across re-ingestion;
- whether any night is partial/incomplete.

Do not expose sensitive raw production data beyond what is needed for the engineering report.

PART C — QUALITY GATES

Define explicit pass/fail gates before enabling V3.

At minimum:
1. all three completed nights ingest under the approved prospective boundary;
2. no duplicate canonical night;
3. provenance is trustworthy and retained;
4. sleep-window/day-boundary semantics are correct;
5. stage reconciliation is internally coherent when stages are present;
6. missing stage detail does not invalidate total sleep if total sleep is otherwise trustworthy;
7. late-arriving samples reconcile idempotently;
8. incomplete current-night data cannot become strategic evidence prematurely;
9. Sleep evidence can be represented without pretending three nights establish a long-term baseline;
10. no historical strategic artifact would be recomputed by the eligibility change.

If any gate fails materially, STOP after the audit with the smallest fix plan. Do not graduate Sleep into V3.

PART D — STRATEGIC SEMANTICS

If quality gates pass, define the bounded meaning of Sleep in V3.

Sleep should be supporting recovery evidence, not an independent Goal or automatic recommendation engine.

V3 may use canonical sleep observations to reason about recovery context such as:
- recent total sleep sufficiency/insufficiency;
- consistency across recent completed nights;
- stage context where trustworthy;
- recovery support around training load.

Guardrails:
- do not diagnose sleep disorders;
- do not overinterpret one night;
- do not treat three nights as a durable personal baseline;
- do not create rigid generic sleep targets unless current coaching policy already owns them;
- do not let Sleep override stronger body-composition/energy/training evidence without model/policy justification;
- do not infer causation from correlation;
- Narrative should state uncertainty where the window is short.

Determine the exact evidence payload/features exposed to V3 and document them.

PART E — V3 ELIGIBILITY

If all gates pass:

Add Sleep/Recovery to the appropriate evidenceEligibility domain(s) prospectively.

Reverify naming against current policy. Do not invent a new domain if an existing canonical recovery/sleep domain is correct.

Increment the relevant policy version.

Ensure:
- only eligible completed Sleep observations on/after the approved start boundary can participate;
- no historical briefing/confidence regeneration is triggered;
- next naturally generated V3 briefing can consume Sleep;
- Strength remains governed by its existing Evidence Review/reconciliation policy;
- Cardio remains unchanged;
- Nutrition/Activity remain unchanged.

PART F — CONFIDENCE + NARRATIVE TESTS

Add deterministic tests proving:
- completed canonical Sleep can enter V3 evidence;
- incomplete/current Sleep cannot;
- pre-start Sleep cannot;
- duplicate/replayed samples do not duplicate evidence;
- missing stage detail is handled correctly;
- short three-night history is represented with appropriate uncertainty;
- Sleep can influence recovery context without mechanically changing Goal confidence;
- Narrative can mention Sleep when strategically relevant;
- Narrative does not mention Sleep when irrelevant;
- historical V2/V3 artifacts remain untouched;
- existing Cardio/Activity/Nutrition behavior is unchanged.

Run all relevant V3 Confidence/Narrative, evidence eligibility, HealthKit and Sleep tests.

PART G — PRODUCTION ROLLOUT

If implementation passes:
- deploy through the current approved Server path;
- verify exact deployed SHA/schema/policy version;
- verify /live and /ready;
- perform bounded post-deploy read-only verification;
- confirm no historical strategic artifacts changed;
- confirm Sleep is eligible prospectively for the next natural V3 generation.

Do not manually generate a briefing solely to prove the feature unless the normal acceptance framework has a non-mutating/safe fixture path.

PART H — NATIVE SCOPE

This task is Server/V3 strategic graduation unless the audit finds a blocking Native ingestion defect.

Do not redesign Sleep UI.
Do not add routine confirmation UI for automatically synced HealthKit Sleep.
Do not change Build 86 Watch/HealthKit work.
Do not touch the global appearance implementation.
Do not publish TestFlight.

PART I — OUTPUT

Publish a concise report covering:
- exact authority;
- three-night audit result;
- per-night quality summary;
- pass/fail gates;
- canonical Sleep semantics;
- exact V3 evidence semantics;
- policy version change if implemented;
- tests;
- deployment authority if deployed;
- proof historical strategic artifacts were untouched;
- what the next naturally generated V3 briefing is expected to do;
- any remaining physical/Founder acceptance.

Update the implementation-delta ledger/backlog only where genuinely appropriate.

Use the normal reporting/latest standard, but do not overwrite or obscure the separate Build 86 workstream's durable report authority; identify this explicitly as the Sleep/V3 lane.

STOP:
- if quality fails: after audit + fix plan;
- if quality passes: after prospective Sleep→V3 implementation, tests, deployment and verification.

END TASK.