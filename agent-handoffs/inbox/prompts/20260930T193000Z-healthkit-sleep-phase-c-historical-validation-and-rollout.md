HealthKit Sleep Phase C — dormant rollout plus isolated 30-night historical validation lane

Standing reporting protocol:
agent-handoffs/inbox/coordination/20260930T013000Z-agent-mandatory-gh-stop-checkpoints.md

READ FIRST

Discovery:
agent-handoffs/reports/20260930T153000Z-healthkit-sleep-discovery-architecture.md

Phase A Server:
agent-handoffs/reports/20260930T180653Z-healthkit-sleep-phase-a-server-foundation.md
Candidate e1e56be696b558762544cd59fa801d7d749a8b76

Phase B Native:
agent-handoffs/reports/20260930T185903Z-healthkit-sleep-phase-b-native-dormant.md
Candidate 62d6b01be67e4e47e1c68224101b0e799e8714a1

FOUNDER DECISION — REVISED SEQUENCING

Founder authorizes a bounded historical Sleep validation/design lane so we can learn from real data before waiting for weeks of prospective accumulation.

Historical validation purpose:
- validate source reconciliation;
- validate Oura-first canonicalization;
- validate totals/stages/episodes/night attribution;
- expose real data shapes and edge cases;
- provide realistic data for a later Claude Sleep Evidence design exercise.

Historical validation MUST NOT:
- become ordinary canonical production history;
- alter historical Briefings;
- alter Goal Confidence;
- alter Strategy Confidence;
- alter V3 Confidence/Narrative;
- alter recommendations;
- alter historical strategic artifacts;
- change Goal progress;
- trigger notifications;
- become eligible strategic evidence;
- silently backfill the prospective canonical stream.

The ordinary production Sleep stream remains prospective-only.

HISTORICAL WINDOW

Authorize a maximum of 30 sleep days immediately preceding the prospective D0.

If exact D0 is not yet selected, prepare the historical lane and use a relative bounded window ending immediately before D0 once D0 is authorized.

Do not read older Sleep history.

SOURCE POLICY

Founder preference:
Oura is preferred whenever it has technically usable coverage.

Implement/write this only through the reviewed generic source-preference policy mechanism.

Other HealthKit sources remain preserved as corroboration/fallback.
Sleep Cycle may appear historically even though it is currently inactive.
Manual is fallback only.

No Native source preference.

PHASE C OBJECTIVES

A. Integrate/deploy Phase A Server foundation dormant.
B. Integrate/distribute Phase B Native path dormant.
C. Build a strictly isolated 30-night historical validation mechanism.
D. Prepare prospective activation + Oura preference operation.
E. Stop for Founder D0/activation authorization before ordinary prospective ingestion.
F. After historical validation data exists, hand off to a separate Claude Evidence-design task. Do NOT design the Evidence UI inside this engineering task.

CURRENT AUTHORITIES

Independently reverify current production Server and current accepted Native authority before integration.

Expected Server authority near task start:
372c306ba45ffaa0f93f7bf74e4c0c266070d9a5

Expected Native accepted authority:
Build 72 source 279103107f044141aa4c9a7487f281dc6fd19423

Do not assume these remain current.

SERVER INTEGRATION

Create a clean current-production descendant integrating only accepted Phase A Sleep foundation e1e56be6.

Preserve:
- corrected Photo Intelligence;
- persistent pairing proof support;
- migration 000015;
- enrollment flag current state;
- all Build 70+ Server behavior.

No strategic Sleep eligibility.

Run exact-integration regression/fresh review.

Deploy only if clean.

DORMANCY ACCEPTANCE AFTER SERVER DEPLOY

Before any Sleep activation/history read prove:
- /live and /ready green;
- exact web/worker source parity;
- Sleep manifest capability exists but enabled=false while policy absent;
- healthkit.sleep.ingest.v1 refuses operational ingest with expected disabled response;
- healthKitSleepSamples count = 0;
- healthKitSleepDays count = 0;
- no Sleep strategic records;
- no historical artifacts changed.

NATIVE INTEGRATION

Create a clean current-Native descendant integrating accepted Phase B 62d6b01b.

Preserve:
- Build 72 persistent pairing and active proof-bound compatibility;
- Build 71 background Strength reconciliation;
- photo inspection;
- accepted Build 70 behavior.

Choose next available Native build number only after exact integration is clean.

Run risk-scaled exact-SHA tests and Release compile.
Do not broad simulator tour.

Upload through Xcode only after Server dormancy verification passes.
Wait for VALID.

Installing this build while Sleep policy is absent must remain inert.

HISTORICAL VALIDATION LANE — ARCHITECTURAL REQUIREMENT

Do NOT defeat the Phase A activation floor or repurpose ordinary operational ingest for history.

Create an explicitly separate validation-only mechanism/namespace/purpose.

Preferred architecture:
- Native or bounded diagnostic reads exactly the authorized 30-night window;
- observations are submitted under an explicit historical_validation/design_validation purpose or separate command;
- Server stores/reconciles them in validation-only collections/namespace or another structurally isolated representation;
- the same sleep-canon-v1 logic and source-preference policy are reused;
- no ordinary prospective Sleep sample/day collection is polluted unless records are unmistakably tagged and every ordinary/strategic reader structurally excludes them.

Strong preference: separate validation collections or ephemeral validation artifact over mixing them into operational collections.

The isolation must be structural, not merely a boolean that future readers could accidentally ignore.

No historical validation record may be visible to:
- V3;
- Briefings;
- Confidence;
- Narrative;
- Goal progress;
- Home;
- ordinary Evidence production feed before the dedicated design task;
- recommendations;
- readiness/settlement.

If the cleanest implementation is an ephemeral/read-only local diagnostic that canonicalizes the 30 nights without persisting production records, prefer that.

Do not commit raw Founder Sleep data to GitHub.

HISTORICAL DATA ACCESS

The Founder has explicitly authorized reading up to 30 historical sleep days for this validation/design purpose.

No additional authorization is required for the bounded read itself once the mechanism is reviewed and installed/available.

Privacy:
- no raw exact sleep timestamps/stages in GH;
- report sanitized aggregates/shapes;
- no source display/device personal names;
- no HealthKit metadata beyond reviewed allow-list.

CANONICAL VALIDATION

For the historical window validate:
- Oura is selected primary whenever technically usable;
- fallback source behavior when Oura absent/unusable;
- no double counting;
- total asleep;
- stage totals;
- awake handling;
- inBed handling;
- main/secondary episodes;
- sleep-day attribution;
- source overlap;
- Sleep Cycle historical presence if any;
- manual samples if any;
- revisions/deletions observable within the bounded dataset;
- timezone/DST anomalies if present;
- stage coverage/completeness;
- unknown/future values if present.

Do not invent coaching thresholds.

Produce sanitized shape metrics useful for design, such as:
- number of nights;
- proportion with Oura primary;
- proportion with staged data;
- presence/count of secondary episodes;
- source overlap frequency;
- missing/incomplete nights;
- typical number of timeline segments;
- which canonical fields are consistently populated.

Do not publish exact private values unless Founder later requests them.

EVIDENCE DESIGN HANDOFF

After historical validation is complete, prepare a separate design handoff for Claude containing:
- canonical contract;
- sanitized real-data shape;
- available fields;
- representative synthetic/redacted examples derived from shapes;
- product constraint that Sleep is evidence for physique/recovery coaching, not a standalone sleep-tracker;
- explicit instruction that strategic weighting/Briefing integration remains undecided.

Do NOT implement/design the UI in this task.

PROSPECTIVE D0

Do not silently choose/activate D0 during Server deployment.

Prepare a guarded operation for:
- Founder prospective effectiveSleepDay D0;
- America/Los_Angeles unless Founder changes it;
- mode validation_only initially;
- historicalBackfill=false;
- strategicEvidenceEligibility=quarantined;
- Oura source preference.

The 30-night historical validation window must end before D0 and remain separate.

STOP for explicit Founder activation authorization before running this prospective policy operation unless Founder has already explicitly selected D0 in a later message.

PROSPECTIVE ACCEPTANCE AFTER ACTIVATION

Once separately authorized:
- foreground once to fetch enabled manifest;
- prove observer registered;
- first anchored query floor-bound;
- no sample before D0 floor;
- background sync without Log dependency;
- next 2–3 nights confirm real ongoing synchronization;
- late updates/deletions/window-manifest reconcile;
- Oura remains primary when usable.

Historical data validates content/canonicalization.
Prospective nights validate transport/background synchronization.

STRATEGIC QUARANTINE

Sleep remains completely strategically inert through all of Phase C.

Do not add to:
- evidenceEligibility;
- readinessDomains;
- V3;
- Briefings;
- Goal/Strategy Confidence;
- recommendations.

TESTING / REVIEW

Required fresh review of:
- Server integration;
- Native integration;
- historical-validation isolation;
- no operational backfill;
- no strategic leakage;
- no private-data leakage;
- current persistent-pairing behavior preserved;
- historical validation and prospective paths cannot collide.

Use synthetic tests for isolation before touching Founder historical data.

No destructive production action.

REPORTING

Publish checkpoints before every stop.

Final Phase C preparation/historical-validation report should include:
- exact Server integration SHA/deployment;
- exact Native integration SHA/build/TestFlight status;
- dormancy verification;
- historical validation architecture;
- exact bounded window used;
- sanitized real-data shape;
- Oura/fallback reconciliation findings;
- canonical correctness findings;
- isolation/quarantine proof;
- prospective activation runner/dry-run;
- D0 status;
- remaining Founder decision;
- Evidence-design handoff location;
- rollback;
- local-only state.

END PHASE C.
