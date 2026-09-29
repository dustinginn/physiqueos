Task id: codexB-midweek-implementation-20260924

Implement the Midweek Briefing repair now that the source forensic audit and bounded production-lineage Slice 0 are complete.

Use the SAME Mac Codex B chat that performed the Midweek forensic audit. Reasoning: High.

Read first:
agent-handoffs/reports/20260924T043732Z-midweek-briefing-forensic-audit-final.md
agent-handoffs/reports/20260924T052145Z-midweek-slice0-production-lineage-complete.md
agent-handoffs/fixtures/20260924T051615Z-midweek-slice0-production-lineage-parity.json

If the exact Slice 0 report path differs, locate the report published by commit 8acece351400867146e4d001636d8760f50d7d7f and use that plus the fixture above.

Production findings are authoritative:
- Sep 20-22 frozen artifact contains structured Energy, Weight, body composition, Training, Goal, Phase, Confidence, and Narrative V3.
- Nutrition and Activity are represented inside Energy rather than separate top-level modules.
- Recovery is absent.
- Machine Lateral Raise 90 lb and Leg Extensions 90 lb are two distinct, internally coherent, evidence-bound facts.
- Machine Lateral Raise was deliberately allocated to Result; Leg Extensions to Coach's Take. This is composition/hierarchy, not a subject relabeling defect.
- Seven stable uncertainties exist; three Energy uncertainties were surfaced in Watch.
- Frozen artifact and bound assessment should remain immutable. Do not regenerate Sep 20-22 merely to repair presentation.

Concurrency:
Codex A is independently working on HealthKit Build 57 / Sep 23 Activity repair. Do not modify Codex A's branches/worktrees. Reverify current main/production authority and create your own isolated Midweek implementation branch/worktree from the appropriate current base. The forensic audit found no direct Midweek file overlap with Codex A, but recheck before integration.

Goal:
Restore a complete, concise, strategically coherent V3 Midweek Briefing using Server-owned presentation semantics, without changing historical strategic facts, Confidence scoring, evidence eligibility, or frozen artifact bytes.

Canonical product contract:

Lead:
- cadence/date range;
- one Server-authored headline;
- one short Goal/Phase-relative meaning;
- compact active Goal/Phase context;
- Confidence exactly once: score/band, movement, one useful reason;
- never render the full concatenated five-section narrative as hero body.

Factual modules:
- Server decides include/omit and reason code;
- render included modules in order: Energy -> Weight/body composition -> Training -> Recovery/execution when applicable;
- no filler modules;
- Energy chart only when at least two defensible paired points;
- Training rollup precedes any movement highlight;
- Nutrition/Activity remain within Energy unless independently decision-relevant under an explicit future contract.

Coaching:
- What changed;
- What it means;
- What to do;
- What to watch;
- omit a section if it adds no distinct semantic claim;
- Coach's Take optional and must add a distinct coaching point;
- no more than one movement-specific claim across lead/Result/Coach's Take unless a second movement materially changes the decision.

Uncertainty:
- at most two visible items;
- decision-relevant, actionable, plain language;
- stable identity/ownership;
- do not repeat uncertainty already presented as Watch or module caveat.

Dedup invariant:
One semantic claim -> one useful visible appearance. A secondary appearance is allowed only if Server assigns a distinct purpose and the copy adds information.

Server/model ownership:
- evidence validity/identity/provenance;
- module include/omit decisions and reason codes;
- Goal/Phase synthesis;
- claim identity/salience/primary-surface assignment;
- uncertainty selection/deduplication;
- narrative wording and movement factual correctness.
Clients must not invent these.

Web/Native ownership:
- faithful ordering/visual hierarchy;
- compact rendering/accessibility;
- included factual modules;
- no local duplicate rendering.
No local strategic interpretation or Confidence derivation.

Implementation sequence:

Slice 1 — assessment-bound Server Midweek presentation projection
Primary files expected:
src/domain/services/MidweekBriefingPresentationService.js
src/application/briefings/BriefingNavigationReadService.js
src/app/briefings/review/[artifactId]/page.js
focused tests + production parity fixture.

Pass the already-loaded exact bound assessment into the projector.
Validate assessment/artifact identity before using it.
Emit a Server-owned presentationContract containing:
- module include/omit decisions + reason codes;
- ordered claim IDs;
- primary surface per claim;
- bounded uncertainties;
- concise lead/Goal/Phase meaning;
- one Confidence surface.
Fail closed when assessment lineage is absent/mismatched; never synthesize facts.
Do not mutate persisted artifact or assessment.

Slice 2 — Web
Remove the all-or-nothing V3 narrative-vs-facts fork.
Render Server contract in order.
Delete assertions that require Energy/Weight/Training/body-composition absence.
Do not recompute strategic meaning or Energy interpretation in React.

Slice 3 — Native
Expected:
ios/PhysiqueOS/Contracts/BriefingReadModel.swift
ios/PhysiqueOS/Networking/ProductionBriefingMapper.swift
ios/PhysiqueOS/Presentation/Briefings/MidweekBriefingSections.swift
focused Native tests.

Decode presentation contract, stable claim IDs, module decisions, bounded uncertainty.
Replace canonicalV3SectionInventory with contract-driven inventory.
Hero uses short lead/meaning, never narrativeV3.detail.
Render included factual modules and only distinct coaching sections.
Confidence once.
Swift does not derive strategy.

Slice 4 — Narrative allocation correction
Only after Slices 1-3 are correct and fixture-backed.
Preserve source-backed specific-coaching candidates.
For recurring cadence, require Goal/Phase meaning + broad-domain synthesis before a second movement-specific allocation.
Cap lead/Result/Coach's Take to one movement claim unless second is decision-changing with explicit allocation reason.
Second movement can remain in structured Training facts.
Do not change Confidence scoring/evidence authority.

Historical behavior:
- Sep 20-22 artifact/assessment bytes remain unchanged.
- Corrected dynamic read projection may make the historical briefing display correctly without regeneration.
- V2 historical artifacts retain legacy rendering.
- Do not perform a Founder-only correction/regeneration unless a separate future authorization proves persisted factual corruption. Slice 0 found no such corruption in the two 90 lb claims.

Acceptance using production fixture:
- Energy visible when inclusion rule passes;
- Weight/body composition visible when inclusion rule passes;
- broad Training rollup visible;
- Goal/Phase meaning present;
- one Confidence surface;
- Machine Lateral Raise and Leg Extensions do not both monopolize narrative prominence;
- both remain factually available in Training facts as appropriate;
- no full narrative detail repeated in hero;
- Result/Meaning/Action/Watch each appears at most once by semantic claim ID;
- <=2 visible uncertainty items;
- Energy uncertainty not duplicated across Watch/module/Still Unresolved;
- Still Unresolved is concise/plain-language, not backend diagnostics;
- Energy chart hidden when pairedDayCount < 2;
- same Server module/claim ordering represented in web and Native;
- malformed assessment/artifact binding fails closed;
- artifact and assessment hashes/versions unchanged through reads;
- V2 legacy unaffected.

Testing:
Use the sanitized production parity fixture from Slice 0.
Add focused Server/web/Native regression tests.
Mutation-test critical gates: assessment binding, primary-surface dedup, module inclusion, one-Confidence rule, narrative prominence cap.
Run relevant full suites.
Use only existing iPhone 17 Pro simulator; no other simulator devices/runtimes.
Fresh-context independent adversarial review exact final Server/Native candidates.

Do not deploy or upload TestFlight without separate Founder authorization.
Do not regenerate historical briefing.
Do not touch HealthKit policy, strategic eligibility, Activity repair, Strength relationship, or Cardio.

Standing GitHub publication rule — REQUIRED:
A substantive chunk is NOT complete until its durable report is committed to GitHub main.
After EVERY substantive chunk publish a timestamped report under agent-handoffs/reports/ to main BEFORE telling Founder the chunk is done.
Every review/deploy/upload/acceptance response in chat must include GitHub commit SHA + report path.
This is a secondary parallel lane: publish reports to main but DO NOT overwrite agent-handoffs/latest.json/latest.md while HealthKit Codex A is the primary lane.
If GitHub publication fails, explicitly say REPORT NOT PUBLISHED and do not represent the chunk as complete.
No publication later; publication is part of completion.

Standing Native simulator/disk rule:
Founder uses iPhone 17 Pro. Retain/use only iPhone 17 Pro simulator device. Do not create/download/retain other simulator devices. Do not delete required iOS runtime. Check disk before builds and use targeted cleanup.

Immediate next step:
Reverify current main and Codex A overlap, create isolated Midweek implementation worktree/branch, implement Slice 1 with the production fixture, test/mutation-test, publish checkpoint to main, then proceed through later slices while maintaining checkpoint cadence.

Final output:
Publish exact Server/Native candidates, tests/mutations, review verdict, historical immutability proof, and Founder authorization request for Server deployment if clean.

Flags:
AUTHORITY_REVERIFIED
CODEX_A_OVERLAP_RECHECKED
PRODUCTION_FIXTURE_LOADED
ARTIFACT_ASSESSMENT_BINDING_ENFORCED
PRESENTATION_CONTRACT_IMPLEMENTED
ENERGY_MODULE_RESTORED
WEIGHT_MODULE_RESTORED
BODY_COMPOSITION_MODULE_RESTORED
TRAINING_ROLLUP_RESTORED
GOAL_PHASE_SYNTHESIS_VISIBLE
CONFIDENCE_SINGLE_SURFACE
PRIMARY_CLAIM_DEDUP_ENFORCED
UNCERTAINTY_BOUNDED
STILL_UNRESOLVED_PLAIN_LANGUAGE
ENERGY_CHART_MIN_PAIR_GUARD
NARRATIVE_MOVEMENT_PROMINENCE_CAPPED
WEB_PARITY_PASS
NATIVE_PARITY_PASS
V2_LEGACY_UNCHANGED
SEP20_22_ARTIFACT_IMMUTABLE
SEP20_22_ASSESSMENT_IMMUTABLE
FRESH_CONTEXT_REVIEWED
SERVER_FIX_REQUIRED
NATIVE_BUILD_REQUIRED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
GH_REPORT_PUBLISHED
