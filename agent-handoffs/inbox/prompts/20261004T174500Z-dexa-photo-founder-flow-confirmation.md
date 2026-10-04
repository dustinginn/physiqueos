PhysiqueOS Photo Event confirmation pass + DEXA corrections

TASK TYPE

Continue in the EXISTING briefing/Log Codex design chat.
Use High reasoning.

This is a focused Founder-feedback pass.

Do not redesign accepted visual styling.
Do not modify shipping Native UI.
Do not deploy Server changes.
Do not create TestFlight.

GOAL

1. Correct two DEXA presentation regressions.
2. Re-render Photo Event using neutral/filler image assets so Founder can verify exact production flow/formatting without confusing synthetic fixture dates with unrelated real Founder media.
3. Audit and explicitly design/verify Photo expansion interactions, including paired comparison expansion.

PART A — DEXA FEEDBACK

Founder likes the overall DEXA visual design.

Two corrections are required.

A1 — UNITS MUST BE EXPLICIT

The new DEXA mock omitted units from many tabular values.

Audit every DEXA field against canonical source/schema and restore the correct unit where applicable.

Examples:
- tissue/fat/weight values: lb where canonical;
- Body Fat: %;
- RMR: cal/day;
- A/G Ratio: unitless;
- other ratios/indices: preserve canonical unitless semantics;
- regional measurements: exact canonical unit;
- deltas: same unit as metric.

Do NOT append lb indiscriminately.

Use field-level source authority.

Units must be visible in:
- previous values;
- current values;
- deltas;
- summary/progress values where applicable.

A2 — PRESERVE GOAL/PHASE BODY-COMPOSITION BREAKDOWN

The new concept reduced "Since starting the Lean Mass phase" to a simple:
start date → current date
days · scans
summary sentence.

Founder rejects that reduction.

Current production DEXA contains a valuable goal/phase body-composition comparison.

Preserve that information architecture in the redesign.

Use current shipping source as authority.

The section should communicate, where canonical fields exist:

- active Goal/Phase title/context;
- start date;
- current scan date;
- elapsed days;
- body-composition scan count;
- DEXA Weight:
  start;
  current;
  delta;
- Body Fat:
  start;
  current;
  delta;
- Fat Mass:
  start;
  current;
  delta;
- Lean Tissue:
  start;
  current;
  delta;
- canonical concluding body-composition summary.

Do not replace this with a decorative timeline.

Keep the new visual language but restore the richer production information architecture.

If current fixture does not naturally contain all fields:
use an exact source-shaped design fixture based on current canonical schema;
clearly label fixture provenance;
do not invent semantics.

Produce focused corrected DEXA dark + mineral-light views.

PART B — PHOTO EVENT FOUNDER REFERENCE FLOW

Founder supplied current-production screenshots as the flow/format authority.

The target flow to preserve is:

1. PHOTO EVENT HERO
- Photo Event identity;
- canonical headline;
- canonical lead.

2. THIS PHOTO SESSION
- date;
- confirmed-view count;
- weight if available;
- conditions/context;
- ALL captured pose thumbnails;
- pose labels;
- dates;
- expansion affordance.

Representative production pose set shown by Founder:
- Front Relaxed;
- Back Relaxed;
- Back Flexed / Rear Flexed — double biceps according to canonical naming;
- Right Side Relaxed;
- Front Flexed.

Source contract wins exact labels.

3. WHAT VISIBLY CHANGED
- section intro;
- matched historical/current views;
- each pose comparison shown as:
  pose title;
  comparison date range;
  PREVIOUS;
  CURRENT;
  two images side-by-side;
  individual dates;
  canonical per-pose interpretation.

The Founder reference demonstrates comparisons for multiple matched poses, including:
- Front Relaxed;
- Back Relaxed;
- Back Flexed;
- Right Side Relaxed;
- Front Flexed.

Do not reduce this to three generic comparison rows if current production has more matched poses.

Use actual current contract/fixture to determine exact count.

4. WHAT THE COMPLETE EVIDENCE MEANS
- preserve exact canonical paragraphs;
- retain its distinct synthesis section.

5. COACH'S INSIGHT
- preserve exact canonical Coach copy;
- preserve next milestone/date treatment if present.

Do not merge "What the complete evidence means" into Coach's Insight.

Do not reorder these sections.

PART C — FILLER IMAGE REVIEW ASSETS

For THIS confirmation pass, Founder explicitly prefers filler images so the review focuses on flow and formatting.

Reason:
the previous concept used real Jun 20/Jun 27 Founder media alongside a synthetic Aug fixture, which makes visual review unnecessarily confusing.

Use clearly non-authoritative neutral filler/reference images in the disposable harness.

Requirements:
- consistent human silhouette/neutral physique reference or clearly marked placeholder imagery;
- enough visual differentiation to understand pose orientation;
- no implication that filler images are Founder evidence;
- no fake body-composition claims derived from filler images;
- labels/dates/copy remain canonical fixture content;
- include a visible prototype-only note in documentation, not necessarily cluttering product UI.

Do not modify or replace production photo bindings.

This is design harness only.

PART D — PHOTO EXPANSION INTERACTION AUDIT

Founder requires explicit confirmation of expansion behavior.

Audit Build 85 source.

D1 — THIS PHOTO SESSION

Tapping an individual session photo should open:
- large single-image viewer;
- correct pose/date context;
- zoom;
- pan;
- dismiss/back;
- preserve aspect ratio.

Determine what current shared full-screen viewer actually supports.

Document:
- currently implemented;
- missing;
- future implementation needed.

D2 — WHAT VISIBLY CHANGED

Founder requirement:

Tapping a photo/pair in "What visibly changed" should open a LARGER COMPARISON VIEWER containing BOTH matched photos together.

Required intended experience:
- Previous + Current simultaneously;
- side-by-side comparison;
- clear Previous / Current labels;
- dates;
- pose title;
- larger use of screen;
- zoom capability;
- pan capability;
- preserve matched pairing;
- easy dismiss/back.

Do NOT assume that routing each thumbnail independently into the current single-photo viewer satisfies this requirement.

Audit exact current behavior.

If Build 85 only opens one image at a time:
document this as a product gap.

Design the intended paired-comparison viewer as a future implementation target.

Do NOT silently claim it already works.

ZOOM BEHAVIOR

Design/implementation target should support useful physique comparison.

At minimum:
- pinch to zoom;
- pan when zoomed;
- reset on dismiss/reopen.

For paired comparison, investigate feasibility of synchronized zoom/pan between Previous and Current.

Preferred:
synchronized zoom/pan so the same body region can be compared at equivalent scale/position.

If synchronized zoom is materially complex or conflicts with current architecture:
document it explicitly and provide:
Option A: synchronized zoom/pan;
Option B: independent zoom/pan.

Recommend one.

Do not implement in this design task.

PART E — PHOTO FLOW CONFIRMATION RENDER

Do NOT redesign styling.

Use the already accepted Photo visual language.

Render a complete flow that makes the information architecture unmistakable.

Required dark:
P1. full Photo Event page;
P2. Hero;
P3. This Photo Session showing ALL poses;
P4. What Visibly Changed — first comparisons;
P5. What Visibly Changed — remaining comparisons;
P6. What Complete Evidence Means;
P7. Coach's Insight;
P8. single-photo expanded viewer;
P9. paired-comparison expanded viewer;
P10. paired viewer zoomed state.

Required mineral light:
same key product states.

At minimum full page + session + visible-change + both viewer modes must be rendered in mineral light.

Standing rule:
dark + mineral light are required.

PART F — CONTENT PARITY

The Founder wants exact production flow and formatting logic preserved.

Build a Photo semantic manifest from current source.

Validate:
- exact section order;
- exact pose set;
- exact comparison count;
- exact pose mapping;
- exact date mapping;
- exact canonical copy;
- exact session facts;
- exact conditions;
- exact weight;
- exact Coach content;
- exact next milestone;
- exact conditional sections.

Filler image pixels are the ONLY intentionally non-canonical product content in this review harness.

No other content substitutions.

PART G — DEXA OUTPUT

Founder does not need the entire DEXA exploration redone.

Render:
1. corrected units table — dark;
2. corrected units table — mineral light;
3. restored "Since starting..." body-composition breakdown — dark;
4. same — mineral light;
5. focused before/after showing old reductive timeline vs restored production breakdown.

PART H — PHOTO OUTPUT

Render the focused confirmation package described above.

Also create:
- interaction-state board;
- flow map;
- source/behavior audit;
- viewer feasibility note.

PART I — IMPLEMENTATION NOTES

DEXA:
identify exact presentation components that need unit formatting and restored Goal/Phase breakdown.

PHOTO:
identify:
- current full-screen photo viewer component;
- current zoom support;
- current pan support;
- current comparison-tile tap routing;
- what is needed for paired comparison;
- feasibility/risk of synchronized zoom/pan;
- accessibility.

No shipping implementation now.

PART J — ACCESSIBILITY

Single photo:
- pose/date VoiceOver;
- zoom accessibility;
- dismiss target.

Paired comparison:
- announce pose;
- Previous date;
- Current date;
- explicit comparison relationship;
- usable without color;
- zoom state accessible;
- Dynamic Type must not obscure photos.

DEXA:
- units included in VoiceOver;
- delta direction spoken;
- tables remain understandable at Dynamic Type.

PART K — SHIPPING ISOLATION

No shipping source changes.
No Server changes.
No photo mutation.
No DEXA mutation.
No build number.
No TestFlight.

Disposable design harness only.

PART L — REPORT DISCOVERABILITY

Follow:
agent-handoffs/README_REPORTING_STANDARD.md

Before stopping:
- canonical report/checkpoint visible on main;
- latest.md updated;
- latest.json updated;
- exact work branch/commit recorded;
- artifact root recorded;
- verify main visibility;
- give exact main SHA.

Branch-only report is insufficient.

PART M — STATUS

DEXA:
accepted styling, focused corrections pending.

Photo:
accepted styling, flow/interaction confirmation pending.

Monthly:
Founder correction accepted conceptually; retain prior status unless separately confirmed.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-dexa-photo-founder-flow-confirmation.md

Include:
- DEXA unit audit;
- DEXA Goal/Phase breakdown mapping;
- Photo exact flow manifest;
- filler-image provenance;
- current viewer behavior;
- paired comparison gap/feasibility;
- zoom/pan recommendation;
- artifact paths;
- dark/light parity;
- confirmation shipping code unchanged.

STOP when focused DEXA corrections and complete Photo flow/interaction confirmation artifacts are ready for Founder review.

END TASK.
