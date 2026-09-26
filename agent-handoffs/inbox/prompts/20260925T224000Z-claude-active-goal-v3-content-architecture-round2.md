Task id: claude-active-goal-v3-content-architecture-round2-20260925

Continue in the existing persistent PhysiqueOS Active Goal V3 Claude conversation. Reasoning: high.

Founder has reviewed the first production-shaped content preview and DOES NOT approve it yet. This task authorizes a second content-architecture/engine iteration, tests, read-only production-shaped preview generation, branch pushes, and Goal-V3 report publishing. It does NOT authorize deployment or TestFlight.

Read first:
agent-handoffs/goal-v3/latest.json
agent-handoffs/reports/20260926T031806Z-goal-v3-candidates-acceptance.md
agent-handoffs/reports/20260926T031806Z-goal-v3-founder-content-preview.md
the current Midweek V3 narrative/briefing reports relevant to HealthKit evidence completeness.

Preserve current candidates as starting authority:
Server 0a245c5c11bd40393b152cbf6b8013a132b6543d
Native efadb35e on top of c15f0881
Production remains 09f04dc5. Nothing is deployed from Goal V3.

FOUNDER ROUND-2 FEEDBACK

The first candidate is substantially more correct, but the page is still too report-like and redundant. The Goal page should not repeatedly narrate the same DEXA/progress facts in Hero, Body Composition, Guardrail, Training, Turning Points, Confidence and Coach’s Take.

Coach’s Take must move to the BOTTOM of the Goal page as the natural conclusion after the factual/current-state sections.

Founder agrees the two previously flagged content issues also need resolution:
1. Sep23 Coach’s Take / What To Watch contains obsolete HealthKit-era language: “calorie totals come from logged meals rather than a confirmed full-day total…”. Fix the UNDERLYING briefing/narrative rule that generated this class of stale completeness language; do not rewrite only the Goal copy.
2. Confidence detail contains stored time-relative language (“4.2 lb remain with 49 days left”) from Sep23. Preserve canonical V3 content, but make provenance/date unmistakable in the Confidence sheet, e.g. “As of Sep 23 Midweek Briefing,” so stored time-relative statements are not presented as current-day facts.

CORE CONTENT ARCHITECTURE

The active Goal page should read as a concise coaching surface, not a report.

Target order:

1. HERO / CONFIDENCE
- Goal name + target.
- 79% Moderate if still canonical.
- ONE concise V3 goal thesis.
- Do not repeat detailed DEXA/training facts that appear below.
- Provenance remains visible but lightweight.

2. JOURNEY / CURRENT PHASE
- Compact Phase1 completed -> Phase2 active.
- Current phase purpose.
- No duplicate progress narration.
- No fictional review language.

3. CURRENT PROGRESS / BODY COMPOSITION
- This is the factual center.
- Baseline vs latest authoritative DEXA + change.
- 5.8/10 progress and remaining amount shown here.
- Do not repeat those numeric facts elsewhere on the primary page unless essential to a distinct interpretation.

4. GUARDRAIL
- Latest authoritative measurement/status.
- ONE short coaching interpretation.
- Do not restate lean-mass increase or other composition numbers already visible immediately above unless essential.

5. TRAINING PROGRESS
- Only the incremental information Training adds beyond DEXA.
- Comparable-movement trend and useful highlights/weakness.
- Do NOT conclude again that the Goal is progressing or repeat the overall Goal thesis.
- Keep it concise; avoid turning the page into a training report.

6. MAJOR MILESTONES / TURNING POINTS
- Historical orientation, not a second Body Composition narrative.
- Jul18 baseline, Aug15 phase transition, Sep12 material milestone.
- Short descriptions.
- Do not repeat every composition-table metric/delta.
- Preserve correct Aug15 +0.8 arithmetic and Sep12 freshness.

7. LATEST COACHING / COACH’S TAKE — LAST
- This must be the final substantive section.
- Clearly attributed/date/type: e.g. Sep23 Midweek Briefing · Coach’s Take.
- Canonical V3 coaching fields only.
- Open Briefing button.
- The narrative should feel like: given everything above, here is the latest coaching.

DEDUPLICATION RULE

Adopt and test this presentation principle:

A quantitative fact should generally appear numerically only once on the PRIMARY Goal page. Later sections may interpret it without repeating the number unless the number is essential to that section’s unique meaning.

Examples:
- +5.8 lb / 58% / 4.2 remaining belong in Current Progress.
- Guardrail may show 8.1% because that number is essential to guardrail status, but should not repeat +5.8.
- Turning Points should not retell the full DEXA table.
- Hero thesis should not enumerate the same metrics.
- Training should not restate DEXA progress.
- Coach’s Take is canonical briefing content and may naturally refer to facts if the briefing itself does; do not locally rewrite it for dedupe. Fix briefing rules upstream when they generate bad/redundant coaching.

CONFIDENCE DETAIL

Keep deeper supporting evidence because the user explicitly tapped for detail.
Add explicit provenance/date within the sheet itself:
“As of Sep 23 Midweek Briefing” or equivalent generated from actual publisher metadata.
Do not hard-code Sep23.
If stored V3 support text says “49 days left,” the provenance must make clear that it is the Sep23 assessment.
Do not recompute or silently rewrite canonical historical V3 assessment text in Native.

BRIEFING-ENGINE HEALTHKIT COMPLETENESS FIX

Diagnose the exact source of:
“calorie totals come from logged meals rather than a confirmed full-day total”
in the Sep23 Midweek What To Watch.

The Founder previously established:
- HealthKit Nutrition is now the primary daily total/macros source where available;
- meal-count/logged-meals completeness language is no longer generally valid;
- completeness must be protocol/coverage-aware, not meal-count-aware;
- nutrition protocol target is the relevant anchor;
- high/low days can be intentional;
- nudges should focus on predictability/strategy only when warranted;
- briefing delivery/evidence settlement should account for evidence completeness.

Determine whether the Sep23 sentence is:
- stale historical canonical output that should remain historically immutable but future briefings are already fixed;
- OR evidence of a still-live engine/day-selection/completeness rule defect.

Do not mutate/regenerate Sep23 historical briefing merely to change its text.

If the engine is already fixed for FUTURE briefings:
- leave Sep23 Coach’s Take verbatim because historical artifacts are immutable;
- explicitly flag the Goal preview as showing the canonical Sep23 historical coaching;
- do NOT create a Goal-local rewrite.

If the engine is still defective:
- fix the shared future briefing/narrative rule at the correct engine layer;
- add tests for HealthKit-graduated Nutrition evidence;
- prove no meal-count completeness language when complete HealthKit daily totals are authoritative;
- preserve nuanced protocol-based interpretation;
- do not regenerate historical briefings;
- evaluate cross-cadence impact (Midweek/Weekly/Monthly/DEXA as applicable);
- include this shared-engine change in the exact Server candidate and reviews.

IMPORTANT: The Goal’s Coach’s Take must always project the actual canonical latest published briefing. Do not synthesize a replacement Coach’s Take just because the historical latest briefing contains wording we now dislike.

ROUND-2 COPY QUALITY

All newly generated Goal narrative must follow V3 coaching rules:
- concrete referents;
- concise;
- interpretive, not database-like;
- no internal engine/process jargon;
- no fictional future workflow;
- no “my recommendation” AI ownership;
- no redundant restatement of visible data;
- no unsupported causal certainty;
- user-facing coaching tone.

Do not hand-author Founder-specific production sentences in Native. Rules/templates must generalize.

TESTS

Add/update deterministic tests for:
- section order with Coach’s Take last;
- primary-page quantitative dedupe contract;
- hero thesis does not enumerate Body Composition metrics redundantly;
- Guardrail does not repeat Goal progress;
- Training summary does not repeat DEXA/overall-goal thesis;
- turning points are concise and not full-table duplicates;
- Confidence sheet provenance/date from publisher metadata;
- no hard-coded date;
- canonical Coach’s Take projection remains verbatim;
- historical briefing immutability;
- if engine completeness fix needed: HealthKit Nutrition authoritative totals suppress meal-count completeness language; protocol-aware nuance preserved; cross-cadence tests.

PRODUCTION-SHAPED PREVIEW ROUND 2

After implementation and validation, run the same bounded read-only production-shaped probe and publish a COMPLETE plain-text preview of the Build61 active Goal page in actual screen order.

The preview must include:
- every heading;
- every metric;
- every dynamic sentence;
- Confidence detail sheet;
- latest Coach’s Take;
- attribution/provenance.

Also include a short “dedupe map” listing each major quantitative fact and where it appears on the primary page, proving the one-primary-location principle.

Do not deploy.

VALIDATION

Re-run affected Server/Native suites, exact-candidate webpack if Server runtime changes, production-shaped acceptance, performance bound, completed Visible Abs Goal immutability, and fresh-context adversarial reviews.

Native candidate must remain a descendant of c15f0881.
HealthKit prospective Cardio path must remain unchanged.

GITHUB

Publish round-2 candidate/acceptance report and round-2 Founder content preview to agent-handoffs/reports/ on main.
Update only agent-handoffs/goal-v3/latest.json.
Do not touch other lane pointers.

STOP for Founder content acceptance again.

NOT AUTHORIZED

No Server deployment.
No Build61 prep/archive/upload.
No TestFlight.
No production data mutation.
No historical briefing regeneration/mutation.
No DEXA mutation.
No HealthKit policy/reconciliation/ingestion/classifier changes.
No Founder-device operation.

Flags:
ROUND2_CONTENT_ARCHITECTURE_PASS
COACHS_TAKE_LAST
PRIMARY_PAGE_DEDUP_PASS
CONFIDENCE_PROVENANCE_VISIBLE
HEALTHKIT_COMPLETENESS_RULE_DIAGNOSED
FUTURE_BRIEFING_ENGINE_FIXED_OR_ALREADY_CORRECT
HISTORICAL_BRIEFINGS_UNCHANGED
LATEST_COACHS_TAKE_VERBATIM
LATEST_DEXA_CURRENT
GOAL_PROGRESS_CURRENT
TRAINING_PROGRESS_CONCISE
TURNING_POINTS_CONCISE
COMPLETED_GOAL_UNCHANGED
PERFORMANCE_BOUNDED
PERFORMANCE_NATIVE_C15F0881_PRESERVED
HEALTHKIT_PROSPECTIVE_CARDIO_PATH_UNCHANGED
SERVER_TESTS_PASS
NATIVE_TESTS_PASS
PRODUCTION_WEBPACK_BUILD_PASS_OR_NOT_APPLICABLE
FRESH_CONTEXT_REVIEWED
SERVER_DEPLOYED
TESTFLIGHT_UPLOADED
PRODUCTION_MUTATED
GH_REPORT_PUBLISHED
