PhysiqueOS Evidence design track — lock Training Evidence + style Nutrition and Activity Evidence hierarchies

TASK TYPE

Continue in Codex B / existing utility + Evidence design chat.
Use High reasoning.

This is a styling-system translation task.

Do not modify shipping Native UI.
Do not create TestFlight.
Do not change Server behavior.
Do not change evidence contracts, canonical Nutrition/Activity data, HealthKit semantics, provenance, strategic eligibility, historical data, navigation or aggregation rules.

PART A — TRAINING EVIDENCE FOUNDER LOCK

Training Evidence design package:
ca088e80e851c83d0d3e168d88f918232f5338d6

Founder reviewed the Training Evidence artifacts.

DECISION:
Training Evidence visual direction is ACCEPTED and LOCKED with one explicit clarification.

TRAINING AREAS — HARD REQUIREMENT

The mock viewport showed only:
- Chest
- Back
- Shoulders
- Quads

This is NOT authorization to reduce, bucket, merge, summarize or prioritize Training Areas.

Current Build 85 source audit confirms:
"Training Areas are the 10 canonical muscle groups, with counts."

Founder wants the current live-app behavior preserved.

Therefore:

Training Areas MUST continue to list ALL 10 canonical Training Areas exactly as current production does.

Do not:
- bucket them;
- merge them;
- hide lower areas;
- show only top/recent areas;
- replace them with four summary categories;
- paginate them merely for design;
- change counts/identity.

The design template may render the full list in the compact 2-column analytical style, but all 10 remain present.

Audit exact current canonical area names/order from source and preserve them.

Update Training Evidence design documentation/coverage to make this explicit.

No need to rerender the whole Training Evidence package unless the current harness actually omitted the remaining six from the full Training Areas card. If so, render only a focused corrected Training Areas viewport in dark + mineral light proving all 10 are present.

Everything else in Training Evidence is accepted.

LOCK STATUS:
Training Evidence = LOCKED after this clarification.

Implementation has not started.

PART B — NEXT EVIDENCE FAMILIES

Now style BOTH:

1. Nutrition Evidence
2. Activity Evidence

Do them in ONE task.

Founder direction remains:
Evidence pages are primarily data-driven.
They do NOT need redesign.
Apply the new PhysiqueOS visual/styling system while preserving current structure and behavior.

SOURCE AUDIT FIRST — REQUIRED

Inspect exact current Build 85 Native authority.

Build complete navigation trees independently for:

NUTRITION EVIDENCE
ACTIVITY EVIDENCE

Do not infer either hierarchy from Training.

Inventory every user-facing page/state/subpage.

PART C — NUTRITION EVIDENCE AUDIT

Audit all current Nutrition Evidence surfaces.

Likely categories may include, but source wins:

NUTRITION ROOT / HISTORY
- Evidence Hub Nutrition row;
- Nutrition Evidence landing;
- current/day summary;
- chronological history;
- date navigation;
- source/provenance;
- scope/goal/phase if present;
- empty/loading/error states.

DAY DETAIL
- calories;
- Protein;
- Carbs;
- Fat;
- meals if current contract exposes them;
- structured meal detail;
- daily totals;
- source summaries;
- historical day;
- notes/evidence attachments if present.

HISTORY / TRENDS
- weekly averages;
- calorie history;
- macro history;
- targets/strategy context only if current Evidence surface already presents them;
- reporting routes;
- charts if currently rendered.

SOURCE / HEALTHKIT
- Apple Health nutrition;
- manual/structured PhysiqueOS nutrition;
- MFP/source-summary legacy evidence if current UI exposes it;
- provenance and aggregation behavior.

REVIEW / CORRECTION
- evidence review;
- pending/confirmed states;
- correction/edit affordances only if current Evidence UI actually contains them.

OTHER NUTRITION SUBPAGES
Audit and include anything source reveals.

IMPORTANT NUTRITION SEMANTICS

Preserve the accepted production aggregation behavior:
complete structured meals own totals where applicable;
source summaries remain provenance/evidence rather than double-counting totals.

Do not change aggregation.

Do not visually imply two sources are additive if they are reconciled representations of the same nutrition.

PART D — ACTIVITY EVIDENCE AUDIT

Audit all current Activity Evidence surfaces.

Likely categories may include:

ACTIVITY ROOT / HISTORY
- Evidence Hub Activity row;
- Activity Evidence landing;
- daily active calories;
- history;
- date grouping;
- source/provenance;
- loading/error/empty.

DAY DETAIL
- active calories;
- workouts if currently part of Activity;
- Apple Health observations;
- manual Activity;
- timestamps;
- source.

HISTORY / REPORTING
- daily/weekly history;
- targets;
- averages;
- charts if currently rendered;
- goal/phase scope if present.

WORKOUT RELATIONSHIP
- Cardio observations where Activity surfaces them;
- Strength workout activity if surfaced;
- Cooldown history if surfaced;
- relationship to Training Evidence.

OTHER ACTIVITY SUBPAGES
Audit source and include all.

IMPORTANT ACTIVITY/CARDIO SEMANTICS

Cooldown:
- may remain visible historically where canonical Activity history contains it;
- remains titled Cooldown;
- is NOT Cardio;
- does not count toward Cardio session counts/minutes/hasCardio/strategy;
- use neutral/recovery styling, not Cardio styling.

Canonical Cardio:
- Stair Stepper, Run, etc retain Cardio identity where current Activity UI exposes it.

Do not change strategic eligibility.

Activity styling must not imply that all workouts are strategically Cardio.

PART E — DESIGN INTENT

Nutrition + Activity are DATA/REFERENCE surfaces.

Target:
- 80% visual-system translation;
- 15% typography/spacing cleanup;
- 5% conservative usability cleanup.

Do not change:
- information architecture;
- order;
- drill-down behavior;
- aggregation;
- source authority;
- navigation;
- data density;
- canonical labels.

Do not invent:
- charts;
- coaching;
- trends;
- scores;
- targets;
- actions.

If a current page is plain because the contract is plain, style it cleanly rather than manufacturing content.

PART F — NEW VISUAL SYSTEM

Use locked PhysiqueOS design direction.

DARK
- deep navy base;
- teal/navy analytical surfaces;
- restrained purple;
- semantic green/amber/teal;
- high-contrast text;
- border/divider hierarchy;
- minimal shadow.

MINERAL LIGHT
- warm mineral base;
- ink/navy text;
- pale teal/mineral surfaces;
- selective stronger colored fields to avoid wall-of-white;
- restrained purple;
- semantic colors;
- minimal shadow.

Use cards selectively.

Prefer:
- open lists;
- compact metric rails;
- grouped analytical rows;
- thin dividers;
- contained fields only where grouping matters.

PART G — DARK + MINERAL LIGHT REQUIRED

Render BOTH appearances for every key Nutrition and Activity iPhone surface.

Standing PhysiqueOS rule:
all product-owned iPhone/iOS surfaces get dark + mineral-light unless documented platform constraints make one irrelevant.

Dark/light:
- same content;
- same navigation;
- same geometry;
- same charts/data;
- same provenance.

Only appearance tokens differ.

PART H — NUTRITION STYLING

Nutrition should make the hierarchy of:
Calories
Protein
Carbs
Fat
easy to scan.

Use the same macro ordering current production uses.

Where day detail has structured meals:
- preserve meal names/order;
- preserve totals;
- use compact rows;
- avoid giant cards for every meal.

Where provenance matters:
- keep source attribution clear;
- avoid repetitive source labels if scoped grouping can communicate it without ambiguity.

Do not centralize provenance if meals/items have mixed sources and attribution would become unclear.

Charts:
only style existing charts.
Do not invent calorie/macro graphs.

PART I — ACTIVITY STYLING

Make:
- daily active calories;
- historical observations;
- workout/activity rows;
- source;
easy to scan.

Preserve Apple Health semantic identity without plastering "Apple Health" redundantly everywhere.

Use scoped provenance where safe.

Distinguish:
- Activity metric;
- Cardio workout;
- Strength workout;
- Walking;
- Cooldown/other;
using text + semantic styling where current contract provides type.

Do not rely on color alone.

PART J — EVIDENCE FAMILY CONSISTENCY

Nutrition and Activity should feel related to locked Training Evidence.

Reuse where appropriate:
- Evidence Report header;
- scope selector;
- analytical metric grids;
- provenance bands;
- history rows;
- async state styling;
- read-only detail rows;
- disclosure patterns.

Do not force Training-specific components onto Nutrition/Activity.

Create Nutrition-specific and Activity-specific primitives where needed.

PART K — COVERAGE MATRICES

Create TWO complete matrices:

Nutrition:
Screen/state | Current source component | Data shown | Navigation in/out | Styling template | Mocked? | Covered?

Activity:
same columns.

Every state must be covered.

Near-identical states may map to a representative template.

No uncovered states.

PART L — REPRESENTATIVE MOCKUPS

NUTRITION — minimum likely set, source wins:

N1. Nutrition Evidence root
N2. Nutrition history/day list
N3. Nutrition day detail with calories + P/C/F
N4. structured meal/day detail if distinct
N5. source/provenance state if distinct
N6. reporting/history/chart page if current product has one
N7. loading/error/empty representative state

ACTIVITY — minimum likely set:

A1. Activity Evidence root
A2. Activity history/day list
A3. Activity day detail
A4. Apple Health workout/activity detail if distinct
A5. mixed activity/workout day if current contract supports it
A6. history/reporting/chart if current product has one
A7. loading/error/empty representative state

If source audit reveals more materially distinct templates, add them.

Render key templates in:
- dark;
- mineral light.

PART M — ACCESSIBILITY

Nutrition:
- Dynamic Type;
- macro labels spoken with units;
- tabular numbers;
- meal/source grouping;
- no color-only macro meaning.

Activity:
- Dynamic Type;
- workout type spoken;
- Cooldown explicit as Cooldown;
- Cardio explicit as Cardio;
- source labels;
- chart summaries if current charts exist.

Both:
- 44pt interactive rows;
- VoiceOver order;
- high contrast;
- read-only data not announced as editable.

PART N — PARITY VALIDATION

NUTRITION
- exact current fields;
- exact totals;
- exact macro values;
- aggregation unchanged;
- source semantics exact;
- no duplicate counting;
- navigation exact;
- zero invented charts/data.

ACTIVITY
- exact current fields;
- source exact;
- Cooldown non-Cardio;
- canonical Cardio exact;
- navigation exact;
- zero invented charts/data.

DARK/LIGHT
- exact semantic parity.

PART O — IMPLEMENTATION FEASIBILITY

Document:
- current Native files;
- reusable Evidence primitives;
- Nutrition-specific primitives;
- Activity-specific primitives;
- styling blockers;
- complexity;
- regression risks;
- snapshot/test needs.

Do not implement.

PART P — SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No evidence contract changes.
No HealthKit changes.
No Nutrition aggregation changes.
No Activity/Cardio policy changes.
No build number.
No TestFlight.
No global theme implementation.

Disposable design harness only.

PART Q — REPORT DISCOVERABILITY STANDARD

Before stopping, follow:
agent-handoffs/README_REPORTING_STANDARD.md

MANDATORY:
- publish canonical report/discoverability checkpoint to main;
- update agent-handoffs/latest.md;
- update agent-handoffs/latest.json;
- include exact work branch/commit/artifact root;
- verify main can read them;
- provide exact main SHA.

Branch-only publication is NOT sufficient.

PART R — LOCK STATUS

Watch: LOCKED.
Live Activity: LOCKED.
Logger: LOCKED.
Training Evidence: LOCKED, all 10 canonical Training Areas preserved.
Nutrition Evidence: EXPLORATION.
Activity Evidence: EXPLORATION.

PART S — REPORT

Publish:
agent-handoffs/reports/<timestamp>-nutrition-activity-evidence-ui-style-translation.md

Include:
- exact Native authority;
- Training lock clarification;
- Nutrition source audit/tree/matrix;
- Activity source audit/tree/matrix;
- artifact paths;
- dark/light parity;
- semantic validation;
- accessibility;
- implementation feasibility;
- confirmation no shipping source changed.

STOP only after Nutrition + Activity hierarchies are completely covered, artifacts are ready for Founder review, and the main-branch discoverability checkpoint is verified.

END TASK.
