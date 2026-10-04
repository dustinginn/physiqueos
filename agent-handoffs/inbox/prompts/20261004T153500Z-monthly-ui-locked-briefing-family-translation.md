PhysiqueOS design system — lock accepted recurring/Log decisions + Monthly Briefing dark/light translation

TASK TYPE

Continue in the EXISTING briefing / Log Codex design chat.
Use High reasoning.

This task has two purposes:

1. Record Founder acceptance/lock decisions for Weekly, Midweek and Log.
2. Design the Monthly Briefing in dark + mineral light as the next member of the locked briefing family.

Do not modify shipping Native UI.
Do not create TestFlight.
Do not deploy Server changes.
Do not alter canonical briefing semantics.
Do not activate Recovery strategically.
Do not implement the global theme yet.

PART A — FOUNDER ACCEPTANCE / LOCK DECISIONS

The Founder has reviewed and ACCEPTED the latest designs.

WEEKLY BRIEFING

LOCKED design direction.

Accepted:
- immersive teal/navy hero;
- Dense Analytical body;
- canonical Weekly content/order;
- Body Composition directly below Weight;
- Photos removed from recurring Weekly;
- Still Unresolved absent;
- graph-driven Recovery;
- condensed left-aligned 2×2 Priority Muscle Groups treatment;
- Biggest Takeaway / What To Do / Into Next Week finale;
- dark appearance;
- mineral-light appearance;
- richer selective dark/teal/lilac fields in mineral light to break up the page and prevent a wall of white.

Founder specifically approves the stronger contained/tinted mineral-light surfaces because they create visual rhythm and contrast.

Do not reopen Weekly design unless future implementation uncovers a technical blocker.

MIDWEEK BRIEFING

LOCKED design direction.

Accepted:
- same briefing-family visual language as Weekly;
- cadence-appropriate Midweek content;
- Body Composition below Weight;
- graph-driven Recovery;
- Biggest Takeaway;
- What To Do;
- What To Watch;
- no Photos;
- no Still Unresolved;
- corrected Weight typography;
- dark appearance;
- mineral-light appearance;
- darker/richer contained section fields in mineral light.

Founder specifically notes:
"The darker cards in the midweek really help break up the sea of white."

Preserve that principle.

Do not reopen Midweek design unless implementation exposes a technical blocker.

LOG

LOCKED design direction:
Compact Command Center.

Accepted:
- dark;
- mineral light;
- realistic density;
- Strength Training + Stair Stepper simultaneously;
- Nutrition calories + P/C/F;
- Activity;
- Weight;
- review state;
- Training Logger action hierarchy;
- quick actions;
- centralized collapsed Sources disclosure at the bottom.

Founder specifically approves the Sources treatment because it:
- keeps Logged Today clean;
- avoids repetitive Apple Health text;
- preserves provenance;
- keeps the page visually compact.

Lock centralized Sources treatment:
collapsed by default;
bottom of Log content above navigation;
expandable to show exact source scope.

Do not reopen Log design unless implementation exposes a technical blocker.

Record all three lock decisions in:
- App-wide UI/design backlog;
- relevant design status documentation.

Implementation has NOT started merely because design is locked.

PART B — MONTHLY BRIEFING GOAL

Now translate the locked recurring-briefing design system to the CURRENT MONTHLY BRIEFING.

Founder wants BOTH:
- dark;
- mineral light.

Do not omit light.

STANDING PHYSIQUEOS DESIGN RULE

For iPhone/iOS product-owned design surfaces, render BOTH dark and mineral-light appearances unless a documented platform constraint makes one irrelevant.

"Dark first" does not mean "stop before light."

MONTHLY IS NOT A LONG WEEKLY

Before designing:
inspect the ACTUAL current Monthly briefing implementation, current Server Monthly contracts, current Native presentation, fixtures/tests, cadence logic, Narrative V3/Confidence V3 behavior and any Monthly-specific sections.

Use current source as authority.

Do not infer Monthly content from Weekly.

Do not simply concatenate four Weeklies.

MONTHLY CADENCE AUTHORITY

Monthly Briefings are intentionally scheduled for the 1st of each calendar month.

Monthly is the higher-precedence recurring briefing when it collides with Weekly or Midweek.

Do not treat calendar-month/day-1 cadence as a discrepancy or technical debt.

Audit current precedence behavior but do not change it.

SOURCE AUDIT — REQUIRED

Inventory the actual current Monthly briefing:

- exact header/date/period;
- Goal/Phase context;
- Confidence content;
- Confidence movement/explanation;
- recommendation/current strategy;
- Narrative V3 content;
- Monthly-specific result/meaning/action/watch structure if applicable;
- Energy / Energy Evolution;
- Weight;
- Body Composition;
- Training;
- Activity/Cardio if current Monthly includes them;
- Photos if current Monthly includes them;
- DEXA context if current Monthly includes it;
- evidence coverage;
- strategy evolution;
- Coach's Take / Biggest Takeaway;
- next-period actions/watch items;
- provenance/revision footer;
- charts/graphs;
- conditional sections;
- loading/not-ready/failure behavior.

Do not rely on this list if source differs.

Create a Monthly-specific canonical information manifest before designing.

HARD CONTENT RULE

Founder has repeatedly established:

DO NOT CHANGE TUNED BRIEFING CONTENT.

Freeze the actual current Monthly:
- words;
- values;
- labels;
- domains;
- domain order;
- narrative;
- Confidence;
- recommendation;
- charts/data;
- conditional semantics;
- provenance.

Do not:
- rewrite;
- summarize;
- rename;
- reorder;
- invent sections;
- remove legitimate Monthly sections;
- add Weekly sections merely for visual parity;
- fabricate data.

The briefing-family system governs VISUAL LANGUAGE.
The Monthly contract governs CONTENT.

RECURRING FAMILY CONSISTENCY

Monthly should clearly belong to the same family as locked Weekly/Midweek.

Carry forward:

HERO
- immersive teal/navy field in dark;
- mineral/teal equivalent in light;
- strong exact Confidence presentation;
- large editorial headline;
- truthful atmospheric geometry.

BODY
- Dense Analytical language;
- fewer unnecessary cards;
- strong quantitative presentation;
- compact metric rails;
- charts as anchors;
- semantic section colors;
- selective containment;
- left-aligned readable text.

MINERAL LIGHT
- do NOT produce a wall of white;
- use selective stronger navy/teal/lilac/mineral fields where they improve hierarchy;
- preserve open neutral canvas between stronger fields;
- use the accepted Weekly/Midweek light rhythm as authority;
- do not mechanically alternate cards.

FINALE
- strong authored synthesis;
- Biggest Takeaway / Coach's Take as canonical;
- clear action/watch hierarchy;
- provenance visually quiet but legible.

MONTHLY VISUAL PACING

Monthly is strategically broader than Weekly/Midweek.

Use visual pacing to communicate:
- longer horizon;
- evolution/trend;
- strategic review;
- month-over-month context where canonical data supports it.

Do NOT create this by adding copy.

Use:
- chart scale;
- section rhythm;
- quantitative summaries;
- broader trend geometry;
- visual grouping.

DATA VISUALIZATION

Monthly should be especially strong where canonical longitudinal data exists.

Audit available real Monthly data.

Where supported, creatively visualize:
- Energy evolution;
- Weight trend;
- Body Composition progression;
- Training progression;
- Cardio/activity trend;
- Confidence movement;
- Goal progress;
- Recovery trend.

Never invent missing time-series points.

Do not convert qualitative narrative into fake quantitative graphics.

Preserve underlying chart semantics exactly.

RECOVERY — REQUIRED FUTURE MONTHLY SECTION

Approved Recovery Briefing V1 architecture explicitly includes Monthly.

Recovery remains:
- future-contract/presentation-only until graduation;
- Confidence-decoupled;
- no Recovery Score;
- no causal claims;
- foam cannot set status.

Monthly Recovery differs from Weekly/Midweek.

Do NOT plot ~30 noisy nightly points as the primary Monthly visualization.

Use weekly aggregation across the completed calendar month.

Preferred Monthly Recovery visual structure:
- 4–5 weekly aggregated sleep points/bands depending on month;
- personal baseline reference;
- month average;
- coverage;
- status;
- notable sustained deviation if policy supports commentary;
- foam adherence/context;
- training corroboration only under approved Recovery policy;
- exact caveat/provenance.

Use approved Recovery V1 architecture as authority.

Do not invent production Recovery output.

Clearly label fixture-only Recovery content in design documentation.

RECOVERY VISUAL STYLE

Use the graph-driven language Founder approved in Weekly/Midweek:
- compact;
- analytical;
- readable;
- purple/lilac sleep trend integrated with teal/navy/mineral family;
- status text + non-color cue;
- baseline visible;
- restrained commentary.

Adapt to Monthly weekly aggregation.

RECURRING SECTION PARITY

Do NOT assume Monthly must have literally identical sections to Weekly/Midweek.

Instead create a matrix:

Section | Weekly | Midweek | Monthly | Reason

Use:
- locked Founder decisions for Weekly/Midweek;
- actual current Monthly contract;
- approved Recovery architecture.

Flag genuine contract differences.

Do not "fix" them silently.

PHOTOS

Weekly/Midweek Photos are intentionally removed from recurring presentation.

For Monthly:
AUDIT current Monthly contract.

Do not automatically remove or include Photos based solely on Weekly/Midweek.

If Monthly legitimately uses a monthly photo/progress comparison as a canonical strategic section, preserve it and flag for Founder review.

If it is merely inherited noise and not part of tuned Monthly authority, document that.

Do not decide content product policy without evidence.

BODY COMPOSITION

Audit current Monthly behavior.

If available:
- preserve exact canonical values;
- use the briefing family's analytical body-composition language;
- exploit month-level trajectory only if source contains the data.

Do not fabricate interpolated composition values.

TRAINING

Preserve exact Monthly training content.

If Monthly includes richer trend/progression data:
- use analytical rails;
- mini trends;
- compact record comparisons;
- muscle-group treatment consistent with the newly approved compact Weekly language where the same canonical content exists.

Do not force Weekly Priority Muscle Groups into Monthly if Monthly contract does not contain it.

ENERGY / ENERGY EVOLUTION

The approved Recovery architecture anticipates Monthly Recovery after Energy Evolution.

Audit actual Monthly ordering.

Preserve canonical Monthly Energy/Evolution content and charts.

Monthly Recovery should appear at the approved architectural location:
after Energy Evolution and before outcome/editorial sections,
unless current approved Recovery architecture has since changed.

If this conflicts with current Monthly contract, document the discrepancy rather than silently changing production semantics.

CONFIDENCE

Use exact current Monthly Confidence semantics.

Do not invent bands/labels.

If ring/arc:
geometry must equal exact score.

If Monthly has movement:
present exact canonical movement.

Do not copy Weekly score/fixture.

FIXTURE

Prefer:
1. actual published Monthly fixture/data already in repository;
2. current Native Monthly test fixture;
3. faithful source-shaped design fixture if necessary.

Do not fabricate narrative.

Recovery may use clearly labeled synthetic future-contract fixture values only because it is not yet graduated.

DARK + MINERAL LIGHT — REQUIRED

Produce both in the SAME task.

Dark and light must have:
- identical content;
- identical section order;
- identical graph data;
- identical geometry/layout;
- identical conditional sections.

Only appearance tokens differ.

LIGHT MODE
Use the accepted richer selective-field treatment from Weekly/Midweek.

Do not wash charts out.
Do not create a continuous white page.

ACCESSIBILITY

Audit:
- narrative type size;
- Dynamic Type;
- long-page VoiceOver order;
- chart summaries;
- non-color status;
- light-field contrast;
- data labels;
- touch targets for actual controls/navigation.

No tiny copy to compress Monthly.

OUTPUT

Produce:

1. Monthly dark full-length
2. Monthly mineral-light full-length
3. dark/light comparison board
4. recurring-family board:
   Weekly dark
   Midweek dark
   Monthly dark
5. recurring-family light board:
   Weekly mineral light
   Midweek mineral light
   Monthly mineral light

Focused Monthly viewports:
6. hero dark/light
7. Energy/Energy Evolution dark/light
8. Weight/Body Composition dark/light
9. Training dark/light
10. Recovery dark/light
11. Coach/Biggest Takeaway/action close dark/light
12. provenance/footer dark/light

If Monthly has additional canonical data-heavy sections, render focused views for those too.

PARITY VALIDATOR

Create Monthly-specific stable semantic IDs from actual current source.

Require:
- exact canonical Monthly fields;
- zero missing;
- zero mismatches;
- zero invented values;
- canonical domain order;
- all current charts/data preserved;
- Confidence exact;
- recommendation exact;
- conditional sections exact;
- provenance exact;
- Recovery fixture boundary explicit;
- dark/light semantic parity exact.

Do not use Weekly IDs as Monthly authority.

IMPLEMENTATION FEASIBILITY

Document:
- existing briefing components reusable;
- new Monthly-specific visual primitives;
- chart changes that are styling-only;
- Recovery future-contract integration;
- SwiftUI complexity;
- any current hard-coded styling blockers;
- no Server changes required for visual-only translation, unless source audit proves otherwise.

SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No global theme implementation.
No build number.
No TestFlight.
No Recovery activation.
No policy changes.

Use disposable design harness only.

LOCK STATUS

After recording this task:

Home:
LOCKED.

Log:
Compact Command Center dark + mineral light LOCKED.

Weekly:
dark + mineral light LOCKED.

Midweek:
dark + mineral light LOCKED.

Monthly:
EXPLORATION pending Founder review.

Watch/Live Activity/Logger are handled in their separate utility workstream and should not be modified here.

BACKLOG

Update:
- Weekly accepted/locked;
- Midweek accepted/locked;
- Log accepted/locked;
- centralized Log Sources accepted;
- Monthly dark/light exploration ready for Founder review when complete;
- Monthly cadence remains calendar-month/day-1 and higher precedence on collision;
- implementation not started.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-monthly-ui-locked-briefing-family-translation.md

Include:
- exact Native/Server authority;
- Founder lock decisions recorded;
- actual Monthly source audit;
- Monthly information manifest;
- recurring-section comparison matrix;
- Recovery Monthly architecture mapping;
- fixture provenance;
- artifact paths;
- dark/light parity;
- accessibility;
- implementation feasibility;
- any genuine Monthly contract discrepancies;
- confirmation shipping code unchanged.

STOP after Monthly dark + mineral-light artifacts are ready for Founder review.

END TASK.
