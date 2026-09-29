Task id: claude-midweek-v3-engine-quality-diagnostic-20260924

This task SUPERSEDES the earlier 20260924T211500Z Midweek energy/copy diagnostic. Do not execute the earlier prompt separately.

Continue in the existing persistent Midweek Briefing Founder Takeover Claude conversation. Reasoning: high.

READ-ONLY DIAGNOSTIC / ARCHITECTURE / EDITORIAL-ENGINE ANALYSIS FIRST. Do not patch, deploy, regenerate historical briefings, create Build 60, or mutate production until later explicit Founder authorization.

Core direction

Build 59 proved the restored Midweek UI/format is the right structural direction. Preserve it. The remaining problem is content quality and one Energy completeness question.

This is NOT a request to hand-edit Sep20–22 copy or add one-off string replacements. The Founder wants the V3 engine improved so future Midweeks naturally produce concise, holistic, decision-relevant coaching in the restored format.

For each complaint, determine the earliest correct owning layer: Confidence V3 assessment/explanation, Narrative V3 composition, presentation-contract composition/dedup/slot ownership, factual-module composition, evidence completeness/cadence, Native rendering, or a combination. Do not hide bad Server output in Native.

Expected current authority: production Server 01d1900bcbb9db32ce270e49c7d24e919ba0d7d7 / deployment 8da160ac-7ae5-4b69-8fd7-342cfff30099; installed Native Build 59 / a269700b. Reverify.

Build 59 FORMAT acceptance: PASS. Preserve the restored established Midweek structure. Do not redesign it.

Founder feedback: Confidence

Current:
79% Moderate Confidence
“No meaningful change”
“Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook.”

Problems:
“one update” is meaningless jargon. What update?
The explanation sounds technical/system-generated.
It should compactly say why confidence is holding, what evidence mattered, and what prevents a stronger change when relevant.
Undefined internal concepts such as update/signal/evidence item/movement should never surface without a concrete referent.

Founder feedback: Hero

Current headline:
“Machine lateral raises reached 90 lb, up from the previous best of 85 lb.”

Current body:
“Training is still moving in the direction this build needs between DEXA checks.”

Problems:
The hero dramatically over-indexes on one exercise.
Movement-specific facts belong in Training, where notable exercise changes are already shown.
Headline is too long and specific; body is too short/general.
Hero should synthesize the period holistically across decision-relevant domains and answer: what happened overall, and what does it mean for the goal/phase?
A movement PR may support the thesis but should not become the thesis unless it materially changes strategy/goal interpretation.

Founder feedback: Energy

Current card visibly contains 2/3 paired days, 219 kcal/day above, Sunday +813, Monday -375, Tuesday No data, averages, and a chart.

Current prose redundantly restates average intake, target delta, active calories, activity target delta, estimated balance, paired-day count, logged-meal caveat, wearable caveat, recommendation, prior-period delta, and DEXA-RMR methodology.

Problems:
WAY too much copy.
It rehashes data immediately visible below.
Remove the statement that calorie totals come from logged meals rather than a confirmed full-day total; that is stale now that HealthKit is canonical nutrition.
Copy should interpret rather than transcribe.

Engine requirement:
Factual modules are data-first. Metrics/chart/rows communicate facts. Module prose should add only incremental meaning that cannot be learned by reading them.
At most one concise interpretation sentence plus an optional compact methodology/uncertainty note only when decision-relevant.
Caveats must be source/provenance aware.
DEXA-RMR methodology should not dominate coaching prose.
Prior-period delta should appear only when it changes interpretation.

Founder feedback: Coach’s Take

Current:
Biggest Takeaway heading has no body.
“My Recommendation”: “Keep executing consistently. Keep the current setup in place.”
What To Watch is a long paragraph repeating Energy caveats, paired-day completeness, calorie recommendation, and next DEXA.

Problems:
Blank Biggest Takeaway is broken.
Recommendation content is directionally fine, but “My Recommendation” violates the product AI/persona rule by using first-person ownership.
Everything else is redundant.
What To Watch should not repeat Energy or Recommendation.
Coach’s Take should add synthesis/action rather than duplicate the briefing.

Engine requirement:
Rendered Coach’s Take slots must be nonempty and semantically distinct.
Biggest Takeaway = most important cross-domain interpretation not already repeated verbatim.
Recommendation = concrete current action/strategy. User-facing label must not use first-person AI language; choose the established PhysiqueOS-consistent label such as Recommendation or What To Do based on existing standards.
What To Watch = only the next uncertainty/trigger that could change the recommendation.
If an optional slot has no distinct content, omit it rather than rendering a blank heading.
No I/my assistant-persona ownership in product UI.

Founder meta-feedback

Do not solve these with Sep20–22 special cases. “Train the engine.”

Audit deeply:
Is Narrative V3 claim selection wrong?
Does salience overweight specific movement claims?
Does the presentation composer assign claims to wrong slots?
Is dedup claim-id-only when semantic dedup is needed?
Are factual-module summaries too verbose upstream?
Are stale provenance caveats frozen or generated dynamically?
Can Coach’s Take legally render empty sections?
Are Recommendation and Watch insufficiently separated?
Does Confidence V3 generate vague generic referents?
Which primitives should apply across briefing cadences versus Midweek only?

Identify reusable engine primitives versus Midweek-specific rules. Do not broaden blindly.

Sep22 Energy completeness investigation

Founder observes Sep20–22 Midweek shows Tuesday Sep22 No data / 2 of 3 paired, while Sep22 Activity and Nutrition are now present in Evidence.

Prove:
1. exact frozen Sep20–22 artifact, assessment, narrative, presentation-contract identities and generation timestamps;
2. frozen Energy inputs for Sep20/21/22;
3. bounded canonical Sep22 Activity and Nutrition revisions, localDate, provenance/source, ingestion timestamps, completeness, eligibility;
4. whether Sep22 data arrived after briefing generation, existed but was ineligible/incomplete, existed and eligible but excluded by a bug, or was frozen correctly then dropped by presentation;
5. local-date/timezone/cutoff/watermark behavior;
6. whether historical artifact should remain 2/3 even though Evidence is now complete. Do not regenerate it;
7. future final-day completeness behavior so Midweek does not publish prematurely while normal HealthKit data is still arriving;
8. next Midweek path under current HealthKit Activity/Nutrition ingestion.

Historical truth-as-of-generation may differ legitimately from current Evidence. Preserve strategic immutability unless a generation defect is proven.

Requested diagnostic/design report

A. Root-cause matrix for every Founder complaint: symptom, owning layer, exact code/template/contract behavior, defect class, reusable correction.

B. V3 Midweek content-quality standard:
Hero holistic and concise; Confidence concrete; factual modules data-first; Training owns movement details; Coach slots nonempty/distinct; Watch future-trigger-only; no stale caveats; no backend jargon; semantic dedup even across different claim IDs; Server remains strategy authority.

C. Architecture proposal. Evaluate reusable concepts such as claim scope/granularity (holistic/domain/detail), semantic roles, source-aware caveats, semantic dedup/ownership beyond claim-id, slot-specific validation, upstream word/character budgets, and separation of factual interpretation from coaching narrative. Use deterministic structural/semantic constraints where possible, not an LLM-only subjective check.

D. Production-fixture acceptance illustrations using actual Sep20–22 facts. Show concise conceptual examples for Confidence, hero headline/body, Energy interpretation, Biggest Takeaway, Recommendation label/content, What To Watch. These are acceptance examples, not hardcoded production strings.

E. Cross-cadence impact: which improvements belong in Weekly/Monthly/DEXA/Photo versus Midweek only. Avoid regressions to accepted briefing types.

F. Sep22 completeness finding and future cadence design.

G. Minimal ordered implementation plan, independently testable/reviewable. Prefer Server engine fixes before Native string hacks. Identify any truly necessary Native changes.

Proposed deterministic tests must cover:
hero does not promote detail movement over holistic/domain thesis when multi-domain evidence exists;
hero length budget;
Confidence has no undefined generic referent;
Energy prose does not repeat displayed metrics;
provenance caveat reflects HealthKit vs legacy/manual source;
Biggest Takeaway cannot render blank;
recommendation label has no first-person AI ownership;
Watch is distinct from Recommendation and Energy interpretation;
semantic duplicates across different claim IDs;
movement facts remain in Training;
3/3 paired Energy fixture;
final-day data before generation;
final-day revision after generation;
timezone/localDate boundary;
frozen artifact immutability;
V2 historical compatibility;
accepted Build59 format inventory unchanged.

Safety:
Read-only only. No code changes, production mutation, historical regeneration, deployment, archive/upload. Do not touch HealthKit worktrees. Do not overwrite HealthKit latest.json/latest.md. Publish a timestamped secondary-lane report to agent-handoffs/reports/ on main and stop for Founder direction.

Flags:
AUTHORITY_REVERIFIED
SUPERSEDES_211500_PROMPT
BUILD59_FORMAT_ACCEPTED_PRESERVED
ENGINE_LEVEL_AUDIT_COMPLETE
CONFIDENCE_V3_ROOT_CAUSE_PROVEN
HERO_SALIENCE_ROOT_CAUSE_PROVEN
ENERGY_VERBOSITY_ROOT_CAUSE_PROVEN
STALE_PROVENANCE_CAVEAT_ROOT_CAUSE_PROVEN
COACH_TAKEAWAY_BLANK_ROOT_CAUSE_PROVEN
AI_FIRST_PERSON_LABEL_IDENTIFIED
SEMANTIC_DEDUP_GAP_ASSESSED
V3_CONTENT_QUALITY_STANDARD_PROPOSED
V3_ARCHITECTURE_CHANGES_DESIGNED
SEP22_NO_DATA_ROOT_CAUSE_CLASSIFIED
NEXT_MIDWEEK_COMPLETENESS_AUDITED
CROSS_CADENCE_IMPACT_MAPPED
IMPLEMENTATION_PLAN_READY
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
