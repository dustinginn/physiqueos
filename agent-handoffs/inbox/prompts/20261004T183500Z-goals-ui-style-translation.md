PhysiqueOS UI design — lock accepted briefing/event surfaces + Goals hierarchy translation

TASK TYPE

Continue in Codex A / existing briefing + primary-app design chat.
Use High reasoning.

Founder is comfortable increasing pace.

Do not over-explore.
Audit current source, preserve product semantics/content, translate the complete Goals hierarchy into the locked PhysiqueOS visual system, validate dark/light parity, and produce concise review artifacts.

No shipping implementation yet.

PART A — LOCK ACCEPTED SURFACES

Record as LOCKED design directions:

Home — locked.
Log — locked.
Weekly Briefing — locked.
Midweek Briefing — locked.
Monthly Briefing — locked with Founder-authorized Coach's Take closing placement and redundant hero Goal/Phase tags removed.
DEXA Briefing — locked with:
- field-specific units preserved;
- full Goal/Phase body-composition breakdown preserved.
Photo Briefing — locked with:
- exact five-section production flow;
- all canonical poses/comparisons;
- single-photo inspection;
- target paired Previous/Current viewer with synchronized zoom/pan.

For Photo:
record paired simultaneous comparison viewer as REQUIRED IMPLEMENTATION behavior because Build 85 does not currently provide it.
Existing single viewer zoom/pan remains.

Do not reopen these designs absent implementation blocker.

PART B — NEXT FAMILY: GOALS

Design/style the COMPLETE Goals hierarchy and all Goals subpages.

Founder wants the new design system applied comprehensively.

This is primarily a styling and hierarchy-cleanup translation, not permission to change Goal semantics.

SOURCE AUDIT FIRST

Inspect exact current Native Build 85 source and current Server Goal/Phase contracts.

Inventory every Goals screen/state, including at minimum where source provides them:

GOALS ROOT
- active Goal;
- completed Goals;
- progress;
- status;
- Goal dates;
- confidence/trajectory if surfaced;
- phase summary;
- guardrail;
- Your Journey;
- progress bars;
- photo/DEXA milestone representations;
- loading/error/empty states.

ACTIVE GOAL DETAIL
- Build Lean Mass current Goal;
- Goal summary;
- progress;
- destination;
- current phase;
- completed phases;
- guardrail;
- confidence;
- phase dates;
- body-composition progress;
- evidence/briefing links if present;
- strategy/operating-plan links if present;
- actions/editing only if current product exposes them.

PHASE DETAIL
- current Phase;
- completed Phase;
- status;
- targets;
- energy strategy;
- activity/expenditure strategy;
- history;
- transition semantics;
- Phase 1 maintenance history;
- Phase 2 lean-mass strategy;
- any current edit/transition flow.

COMPLETED GOAL DETAIL
- Visible Abs;
- completion state;
- first/latest or first/final real progress photos where current contract requires them;
- start/end values;
- Goal outcome;
- phases;
- timeline;
- DEXA;
- briefings/evidence;
- completed-state presentation.

YOUR JOURNEY
- current production content;
- progress bars;
- chronological Goal relationship;
- completed/current distinction.

OTHER GOAL SUBPAGES
Audit source and include all current materially distinct pages/states.

KNOWN FOUNDER REQUIREMENTS

Preserve:
- Build Lean Mass active Goal;
- Visible Abs completed Goal;
- Goal system vs Phase system distinction;
- Guardrail is NOT another phase;
- guardrail applies across relevant phases;
- progress bars on Your Journey;
- completed Visible Abs first/final real progress-photo intent;
- Goal baseline and current canonical values;
- exact Confidence semantics;
- Goal/Phase labels without redundant "Build Lean Mass / Lean Mass Build" repetition where the locked Home direction already solved it.

Do not change canonical Goal/Phase data.

GUARDRAIL

Visually separate Guardrail from sequential phases.

It must not look like:
Phase 1 → Phase 2 → Guardrail.

It is a persistent constraint/requirement across the Goal.

Use the locked Home solution as design authority.

COMPLETED VISIBLE ABS PHOTOS

Audit current source/media behavior.

Founder previously required completed Visible Abs Goal to show first and last real progress photos.

Preserve this product requirement.

Use real Founder media only where current app architecture safely provides it.

Do not fabricate bindings.

If current Build 85 still has a media-loading/product gap:
document it explicitly and design the intended state without pretending it is implemented.

DARK + MINERAL LIGHT

Required for every key Goals surface.

Use locked Home visual language as primary tone authority.

Goals should feel like a natural deeper layer of Home.

Do not invent a separate visual identity.

DESIGN PRINCIPLES

Goals are strategic/product surfaces, not raw Evidence.

Allow slightly richer presentation than Evidence while maintaining:
- compactness;
- legibility;
- strong progress hierarchy;
- clear current/completed states;
- restrained cards;
- meaningful color;
- semantic phase/guardrail distinction.

Avoid:
- giant redundant headers;
- every row becoming a card;
- excessive purple;
- tiny metadata;
- duplicate Goal/Phase naming.

CONTENT

Preserve all current canonical content.

Do not rewrite tuned Goal language merely for mockups.

No fake progress numbers.
No fake dates.
No fake confidence.
No fake photo bindings.

COVERAGE

Build complete matrix:
screen/state | source component | canonical data | navigation | design template | mocked | covered.

Zero uncovered states.

REVIEW OUTPUT

Founder wants concise review, not a giant exploration.

Produce:
1. Goals root dark/light.
2. Active Build Lean Mass Goal detail dark/light.
3. current Phase detail dark/light.
4. completed Phase detail if materially distinct.
5. completed Visible Abs Goal dark/light.
6. Your Journey dark/light.
7. completed-goal photo section focused view.
8. Goal/Phase/Guardrail relationship focused view.
9. representative loading/error/empty only if materially distinct.
10. concise coverage board.

If other actual pages are materially distinct, include them.

Do not produce three design directions.
Use the locked app language.

ACCESSIBILITY

Dynamic Type.
VoiceOver progress semantics.
Progress not color-only.
Phase status spoken.
Guardrail distinction explicit.
Photos labeled by date/role.
44pt navigation/actions.

IMPLEMENTATION FEASIBILITY

Document:
- reusable Home/briefing primitives;
- Goal-specific primitives;
- current files;
- media risks;
- hard-coded styling;
- regression risks;
- snapshot/test requirements.

No implementation.

REPORT DISCOVERABILITY

Follow agent-handoffs/README_REPORTING_STANDARD.md.

Before stopping:
- canonical checkpoint on main;
- latest.md/latest.json;
- exact branch/commit/artifact root;
- verify main visibility.

REPORT

agent-handoffs/reports/<timestamp>-goals-ui-style-translation.md

LOCK STATUS

Accepted surfaces above = locked.
Goals = exploration pending Founder review.

STOP when complete Goals hierarchy is covered in dark/light and concise review artifacts are ready.

END TASK.