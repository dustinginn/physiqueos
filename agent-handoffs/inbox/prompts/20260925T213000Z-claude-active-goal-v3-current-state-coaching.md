Task id: claude-active-goal-v3-current-state-coaching-20260925

Start a NEW isolated Claude coding chat/worktree for PhysiqueOS Active Goal V3 Current-State + Coaching Projection. Preferred coder: Claude. Reasoning: high.

This is a correctness + product-contract project. Diagnose before patching. Do not treat it as a set of one-off Swift copy edits.

Read first:
agent-handoffs/STANDING_DISK_SAFETY.md
agent-handoffs/latest.json
agent-handoffs/latest.md
agent-handoffs/performance/latest.json
agent-handoffs/training-localday/latest.json
current Midweek V3 confidence/narrative reports
current production deployment reports
current Build60/Native release reports.

Reverify authority. Expected production Server 09f04dc54eb26bfccdd2aeb34b156d8fc7d3f80e. Native installed Build60 00321dcc6dd86a6479dbca5dd27e691c87348cd8. Future Native candidate c15f0881 is unreleased and already contains Performance Phase2 + local-day correctness. If Native changes are needed, produce a clean combined descendant of c15f0881; do not overwrite that work. Prospective HealthKit Cardio acceptance remains protected and untouched.

FOUNDER FEEDBACK / PRODUCT CONTRACT

The active Build Lean Mass Goal page is not adequately reflecting current progress. The completed Visible Abs Goal is NOT the defect; use it only as a lifecycle/presentation reference where useful.

The Founder reviewed the current active Goal page and identified:

1. Confidence:
- displayed 79% Moderate appears correct;
- explanation is technical/meaningless: e.g. “Confidence holds... one update...” has no useful referent;
- active Goal must consume current Confidence V3 / Narrative V3 correctly and follow the engine’s coaching-language rules;
- Native must not invent a separate confidence narrative.

2. Current Phase:
- remove language such as “Evidence keeps accumulating toward the next review”;
- remove the separate “Goal review comes next” concept/card unless an actual user-facing review workflow exists;
- “next review” falsely implies a future interaction/prompt;
- keep the page focused on the Goal/current phase. Cadence context like Monthly/DEXA-aligned may remain only if genuinely useful and nonredundant.

3. Guardrail:
- canonical 8–9% body-fat guardrail and latest observed body fat are facts;
- current card merely classifies “below range” and lacks coaching interpretation;
- V3/Goal projection should explain what current guardrail position means for the lean-mass strategy, using current authoritative evidence and engine coaching rules;
- do not hard-code a Founder-specific conclusion in Native.

4. DEXA/current progress:
- Evidence Anchors currently shows the Jul18 Goal baseline DEXA as though it were the only composition state;
- Founder has had subsequent DEXAs, including latest canonical Sep12;
- baseline must remain baseline, but current authoritative DEXA must drive current state/progress;
- show/derive baseline -> latest -> change where useful;
- audit all canonical DEXA dates/records and selection logic read-only before changing anything.

5. Goal progress calculation:
- repeated 5.8 lb / 58% must be independently proven from canonical Goal target/baseline/current authoritative evidence;
- do not assume it is correct because it looks plausible;
- audit suspicious existing Aug15 text: displayed “148.3 lb lean mass, +5.8 lb from goal baseline” conflicts arithmetically with displayed baseline 147.5 lb (148.3 - 147.5 = 0.8);
- determine whether displayed lean mass, delta, baseline semantics, or field mapping is wrong;
- no data mutation merely to make UI arithmetic work.

6. Training Progress:
- current “Server-derived” boilerplate (“Weekly evidence monitors intake, activity, training...”) is not training progress;
- use actual structured longitudinal Training evidence/performance to summarize whether training is progressing in support of the lean-mass Goal;
- coaching interpretation must be engine/server-owned, not hard-coded Native prose.

7. Evidence Turning Points:
- currently appears frozen around Aug15 despite later meaningful evidence including Sep12 DEXA;
- turning points should be selective, not every evidence event;
- materially Goal-changing evidence must be eligible;
- prove selection semantics and freshness.

8. Redundancy:
- reduce repeated 58%, repeated DEXA-authoritative explanations, repeated cadence/process language and repeated evidence-accumulation boilerplate;
- information hierarchy should emphasize current state and what it means.

9. Current Strategy section:
- REMOVE the current grid/cards: Energy, Nutrition, Activity, Training, Coaching Updates, Peptide, Supplement, plus Review Strategy / Review Protocols from this active Goal summary section.
- Replace that section with the actual latest published briefing’s canonical Coach’s Take.
- Clearly attribute/date it, e.g. “Sep 23 briefing · Coach’s Take” (use actual latest briefing date/type).
- Render canonical V3 Coach’s Take fields faithfully. Do not create a second Goal-specific coaching system.
- If latest briefing Coach’s Take contains stale/bad language, do NOT locally rewrite it on Goal. That is a briefing-engine defect to flag separately.
- Goal page should make provenance obvious.

CENTRAL ARCHITECTURAL PRINCIPLE

Canonical facts establish where the Goal actually stands.
Confidence V3 / Narrative V3 and canonical briefing coaching supply interpretation.
Native presents those faithfully and does not invent its own coaching narrative.

Target information hierarchy:
Starting point -> current authoritative state -> progress toward target -> guardrail status -> supporting training/execution evidence -> coaching interpretation / latest Coach’s Take.

PART A — READ-ONLY PRODUCTION FORENSICS

Using guarded read-only production access:
- enumerate active Build Lean Mass Goal definition, target, phases, baseline/effective dates;
- enumerate canonical DEXA scans relevant since Jul18, including Aug15 and Sep12, with lean/fat/BF/weight and validity/supersession;
- identify exact latest authoritative DEXA;
- trace current 5.8/58 calculation and every displayed Aug15 number to source fields;
- enumerate current Confidence V3 record, score/band/movement/explanation/assumptions/evidence references;
- enumerate current Narrative V3/Goal projection fields;
- identify latest published briefing and exact canonical Coach’s Take fields/date/type;
- inspect structured Training evidence/performance since Goal baseline/phase start;
- trace Evidence Turning Point source/selection;
- trace Goal page Server read model -> API JSON -> Native decode -> rendering.

Prove where staleness/copy originates. Do not infer.

PART B — V3 CONTRACT AUDIT

Compare active Goal consumption against the deployed Confidence V3/Narrative V3 contracts and Midweek standards.
Determine:
- whether Goal uses stale V2/legacy explanation;
- whether it uses V3 but wrong field/presentation;
- whether V3 itself emits unacceptable engine jargon in Goal context;
- whether a shared engine correction is required.

Do not patch only the Goal screen if the engine contract is wrong.
Do not globally alter Midweek/Weekly/Monthly semantics without tests proving the shared change is intended.

Coaching-language rules:
- user-facing, concrete, goal-specific;
- no “one update”, “evidence accumulation”, “next review”, internal model/process jargon;
- explain meaning, not machinery;
- avoid redundant restatement of visible metrics;
- no first-person AI ownership (“my recommendation”);
- no invented certainty or unsupported causal claims.

PART C — ACTIVE GOAL READ-MODEL CONTRACT

Define explicit fields for:
- Goal baseline;
- current authoritative composition state;
- delta/progress to target;
- guardrail measurement + interpretation;
- current phase;
- current Confidence V3;
- training progress summary;
- selective turning points;
- latest briefing Coach’s Take with provenance/date/type.

Baseline and current must never be conflated.
DEXA authority/freshness rules must be explicit.
Goal progress must be deterministic and tested.

PART D — IMPLEMENT MINIMAL CORRECT ARCHITECTURE

Prefer Server projection/read-model corrections where truth/interpretation belongs.
Native should render contract fields and simplify layout.
Remove fictional review UX and obsolete Current Strategy grid from active Goal page.
Replace with latest briefing Coach’s Take presentation.

If Native changes are required, base combined Native work on c15f0881 so future Build61 retains:
- Performance Phase2;
- local-day/timezone correctness.
Do not regress either.

PART E — PRODUCTION-SHAPED ACCEPTANCE

Using current production data read-only, prove expected active Goal result, including:
- baseline Jul18 clearly identified as baseline;
- latest authoritative DEXA is Sep12;
- current lean mass/body-fat/weight/fat mass values exactly match canonical Sep12;
- progress calculation exactly reconciles baseline/target/current;
- no stale Aug15 arithmetic;
- Confidence V3 79% Moderate if still current, with correct current explanation/provenance;
- guardrail interpretation uses latest composition;
- Training Progress reflects actual current structured training evidence;
- Turning Points include later material evidence where selection rules warrant it;
- latest published briefing Coach’s Take is correctly selected and dated;
- no fictional review language;
- no obsolete strategy grid;
- redundancy materially reduced.

Do not hard-code dates/numbers in product code.

PART F — REGRESSION CONTROLS

Completed Visible Abs Goal must remain unchanged unless a shared correctness fix legitimately affects it and is proven safe.
Historical Goal pages must preserve historical evidence/state rather than adopting today’s DEXA.
No historical briefing/confidence/narrative artifacts may be regenerated or rewritten.
Active Goal must update automatically when a newer authoritative DEXA or briefing is published.
Superseded/invalid DEXA revisions must never become current.

PART G — TESTS

At minimum:
- baseline vs latest DEXA selection;
- superseded/invalid exclusion;
- Goal progress arithmetic;
- no baseline/current conflation;
- Confidence V3 field/provenance selection;
- no legacy/V2 fallback when valid V3 exists;
- guardrail interpretation contract;
- training progress freshness;
- turning-point freshness/selectivity;
- latest published briefing selection;
- Coach’s Take provenance/date/type;
- no fictional “next review” output;
- completed Goal historical immutability;
- active Goal auto-updates with newer DEXA/briefing fixtures;
- Native decode/render tests if contract changes;
- performance payload remains bounded.

PART H — VALIDATION

Server changes:
- focused and relevant broader tests;
- production webpack exact candidate;
- production-shaped zero-write probe;
- fresh-context adversarial review.

Native changes:
- focused tests;
- existing iPhone 17 Pro simulator only;
- full unit suite if executable-source scope warrants;
- obey STANDING_DISK_SAFETY.md;
- fresh-context adversarial review.

No performance regression: active Goal <=3s hard ceiling, <=1–2s preferred warm.

PART I — GITHUB / RELEASE PLAN

Publish diagnostic, candidate, and final acceptance reports under agent-handoffs/reports/ on main.
Use a goal-v3-specific lane pointer; do NOT overwrite HealthKit latest, performance latest, training-localday latest, or Midweek ownership pointers.

Final report must include:
- exact canonical current Goal/DEXA facts;
- proven root causes;
- before/after Goal contract;
- exact Server/Native candidate SHAs;
- relationship to c15f0881;
- tests/build/reviews/performance;
- any shared V3 engine changes and cross-cadence impact;
- recommended release order.

STOP for Founder release authorization.

NOT AUTHORIZED

No Server deployment.
No Native Build61 prep/archive/upload/TestFlight.
No production data mutation.
No DEXA mutation.
No historical artifact regeneration.
No HealthKit policy/reconciliation/ingestion/classifier changes.
No prospective Cardio path changes.
No Founder-device operation.

Flags:
AUTHORITY_REVERIFIED
ACTIVE_GOAL_FORENSICS_COMPLETE
LATEST_DEXA_SELECTION_PROVEN
GOAL_PROGRESS_ARITHMETIC_PROVEN
AUG15_INCONSISTENCY_RESOLVED
CONFIDENCE_V3_PIPELINE_PROVEN
COACHING_LANGUAGE_CONTRACT_ENFORCED
FICTIONAL_REVIEW_LANGUAGE_REMOVED
GUARDRAIL_COACHING_INTERPRETATION_PRESENT
TRAINING_PROGRESS_CURRENT
TURNING_POINTS_CURRENT_SELECTIVE
LATEST_BRIEFING_COACHS_TAKE_PROJECTED
COACHS_TAKE_PROVENANCE_VISIBLE
STRATEGY_GRID_REMOVED
REDUNDANCY_REDUCED
COMPLETED_GOAL_UNCHANGED
HISTORICAL_ARTIFACTS_UNCHANGED
PERFORMANCE_BOUNDED
PERFORMANCE_NATIVE_C15F0881_PRESERVED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
SERVER_TESTS_PASS_OR_NOT_APPLICABLE
NATIVE_TESTS_PASS_OR_NOT_APPLICABLE
PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
