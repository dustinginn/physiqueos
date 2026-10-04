PhysiqueOS Weekly Briefing UI — wide-leash creative composition pass

TASK TYPE

Codex design exploration only.

This is a deliberate expansion of visual freedom after the prior Weekly passes remained too conservative.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not change canonical briefing content or semantics.
Do not activate Recovery.

FOUNDER FEEDBACK

The latest Weekly pass is still rejected as too conservative.

Founder assessment:
"The only real change is the top card."

The page remains too card-driven and too close to the old visual composition.

Founder now explicitly grants a LONGER VISUAL LEASH.

The requirement is:

SAME CONTENT.
SAME FACTS.
SAME CANONICAL DOMAIN ORDER.
MUCH MORE CREATIVE PRESENTATION.

Do not interpret content fidelity as layout fidelity.

WHAT IS FROZEN

Freeze:
- every canonical word/string;
- every metric/value;
- every canonical domain;
- canonical domain order;
- every existing chart's underlying data/series/meaning;
- Confidence semantics;
- recommendation semantics;
- Coach's Take content;
- Into Next Week content;
- uncertainty/provenance content;
- conditional visibility semantics;
- Recovery's approved future insertion point after Training.

Do not rewrite, summarize, omit or invent content.

WHAT IS NO LONGER FROZEN

Do NOT preserve:
- current card geometry;
- current card count;
- current component rectangles;
- current within-section ordering of supporting visual elements when meaning is unchanged;
- current paragraph/card layout;
- current metric presentation;
- current chart framing;
- current surface hierarchy;
- current spacing rhythm;
- current use of dividers;
- current presentation density.

The prior W-ID 1:1 geometry concept is retired.

Parity now means INFORMATION CONTRACT parity, not visual-component parity.

CANONICAL DOMAIN ORDER

Keep the major briefing flow in the same canonical order from current production.

Within each canonical domain, creatively compose its exact content.

Do not move Energy content into Training, etc.

LOCKED HOME AS DESIGN-TONE AUTHORITY

The selected Home design remains the strongest visual reference.

Use its spirit:
- immersive color fields;
- large confident typography;
- restrained atmospheric geometry;
- open canvas mixed with selective containment;
- semantic color;
- strong hierarchy;
- compact but readable information;
- fewer unnecessary boxes;
- modern premium feel.

Weekly should feel like the same product family.

Do not copy Home's literal layout.

CARD REDUCTION — EXPLICIT

The Weekly is currently too card-driven.

For this pass:
- cards should be the exception, not the default;
- do not put each domain in a large rounded rectangle;
- do not put every metric in a tile;
- do not nest cards inside cards unless there is a compelling interaction/semantic reason;
- use background fields, open canvas, typography, rules, geometry, chart space and alignment as primary structure.

A card is justified when it adds actual containment or emphasis.

If a concept can remove a card without reducing comprehension, prefer removing it.

DATA SHOULD LOOK LIKE DATA

Founder specifically asks:
"Find creative ways to display data where there is data."

Audit all canonical numeric/structured data in the Weekly fixture.

For each quantitative area, ask whether a visualization can improve comprehension WITHOUT changing the underlying meaning.

Examples of permitted visual transformations when supported by existing canonical data:

ENERGY
- preserve the existing intake-vs-expenditure data;
- may radically redesign the existing bar-chart presentation;
- explore integrated bars, tracks, paired columns, compact horizon charts, inline comparison geometry, or other truthful forms;
- exact values/data remain.

WEIGHT
If the canonical Weekly input contains the time-series points underlying the current Weight graph:
- visualize the actual series;
- use sparkline/trajectory/area/line treatments;
- show current rate/context spatially.

Do not invent missing points.

TRAINING
Where canonical data contains lift records, counts, volume/reps/load comparisons:
- use scale, progress bars, mini comparison tracks, delta geometry, ranked rows, or other truthful quantitative forms;
- retain exact lift names and values;
- do not fabricate percentages.

BODY COMPOSITION
Where canonical DEXA/body-composition values exist:
- explore proportional/trajectory geometry;
- goal remaining visual;
- lean-mass progress track;
- guardrail band;
- exact values remain authoritative.

CONFIDENCE
- use exact score;
- ring, arc, large numeral, gauge or integrated trajectory geometry are allowed;
- geometry must accurately represent the value;
- do not invent a band/label.

RECOVERY
Use only fields legitimately present in the future Recovery fixture.
- duration/baseline/coverage can be spatially visualized;
- do not invent sleep-series points;
- do not imply strategic coupling.

QUALITATIVE CONTENT SHOULD NOT PRETEND TO BE QUANTITATIVE

Do not create fake graphs from narrative statements.

Do not invent:
- scores;
- percentages;
- time-series values;
- rankings;
- causal relationships.

If the canonical data is qualitative, use typography/composition rather than fake data visualization.

CHART SEMANTIC FREEDOM

The underlying data and meaning of existing graphs are frozen.

The exact graphical FORM is no longer frozen.

Codex MAY change:
- bar chart to paired bars/tracks where the same relationship remains truthful;
- line styling;
- chart orientation;
- chart framing;
- inline vs full-width visualization;
- grid/axis treatment;
- labels placement;
- legend treatment.

Codex MAY NOT:
- remove the information;
- change values;
- change comparison basis;
- imply a different statistical relationship;
- aggregate away meaningful points;
- fabricate points.

For every transformed chart, document the semantic equivalence.

THREE REQUIRED CONCEPTS — MUST BE FUNDAMENTALLY DIFFERENT

Produce exactly THREE primary Weekly visual directions.

Each must preserve the same information contract and domain order.

All three should be rendered in DARK first for direct comparison.

After Founder selects/refines a direction, mineral-light translation can follow in the next round.

This is intentional: spend effort on genuine composition differences rather than doubling mediocre concepts.

VERSION A — DATA EDITORIAL

Premise:
A premium editorial report where quantitative evidence becomes the visual rhythm.

Characteristics:
- very few cards;
- large type;
- charts/mini-visualizations integrated directly into the page;
- open canvas;
- strong horizontal/vertical alignment;
- semantic color fields;
- narrative blocks interleaved with truthful data graphics;
- Coach's Take gets authored editorial emphasis.

Think:
high-end performance report, not dashboard.

VERSION B — IMMERSIVE STORY

Premise:
A continuous visual story inspired by the locked Home hero.

Characteristics:
- large section-spanning color fields;
- transitions between domains;
- atmospheric geometry derived from real data where possible;
- narrative and data coexist inside broad visual scenes;
- minimal conventional card chrome;
- Confidence/goal trajectory establishes visual language;
- Energy, Weight, Training, Recovery each get a distinctive visual moment without becoming separate dashboard cards.

Think:
scrolling story / annual-report quality, but practical SwiftUI.

VERSION C — DENSE ANALYTICAL

Premise:
Maximum useful information density without tiny text or card overload.

Characteristics:
- compact aligned metric rails;
- sparklines/tracks;
- tables/rows where appropriate;
- structured columns;
- thin rules;
- selective highlighted surfaces;
- highly scannable;
- much more data-forward;
- minimal decorative space.

Think:
premium analytical instrument, not spreadsheet.

HARD DIFFERENCE TEST

Before accepting A/B/C:

Convert each mentally to grayscale wireframe.

They must have materially different:
- section geometry;
- data visualization style;
- typography rhythm;
- use of whitespace;
- containment strategy;
- visual flow.

If two concepts share substantially the same rectangles/stack with different styling, reject one and redesign.

HOME-FAMILY TEST

Despite being different, all three must still plausibly belong to the same app as locked Home.

Use shared:
- typography family;
- core palette;
- semantic accents;
- icon philosophy;
- polish level.

Do not make three unrelated brands.

TRAINING — PRIORITY MUSCLE GROUPS

The centered/narrow layout remains rejected.

Use exact muscle-group content.

A/B/C should each solve it differently, but all must be:
- left-aligned or naturally scan-aligned;
- legible;
- compact;
- no awkward word wrapping;
- no decorative centering.

Examples:
- horizontal labeled rails;
- compact grouped lists;
- tag clusters with adequate width;
- structured two-column left-aligned grouping.

RECOVERY

Recovery remains one additive future-contract section after Training.

Keep the same fixture content.

Let each concept present Recovery differently.

Do not activate it strategically.

COACH'S TAKE / INTO NEXT WEEK

Preserve exact text.

These should not simply be another generic card.

Use strong closing composition.

Into Next Week should be scannable and actionable without changing wording.

PROVENANCE / REVIEW FOOTER

Preserve exact content.

May be visually quiet but must remain legible.

REAL IOS / IMPLEMENTABILITY

These are creative explorations, but must remain implementable in SwiftUI.

Use actual iPhone width/safe areas.

Long vertical scrolling is fine.

Do not:
- rely on impossible overlapping text;
- use unreadably small labels;
- create fixed layouts that break Dynamic Type;
- require custom graphics impossible to reproduce reliably.

Provide implementation notes for any ambitious visualization.

ACCESSIBILITY

Maintain:
- comfortable body copy;
- Dynamic Type feasibility;
- contrast;
- VoiceOver reading order matching canonical domain order;
- non-color cues;
- accessible chart summaries;
- Reduce Motion.

OUTPUT

Produce:

A — Data Editorial dark full-length
B — Immersive Story dark full-length
C — Dense Analytical dark full-length

For each also render:
- top/hero viewport;
- Energy visualization viewport;
- Training viewport;
- Recovery viewport;
- Coach's Take / Into Next Week viewport.

Create one three-way comparison board.

Do NOT spend time producing light versions yet.

Founder will select/refine first.

DESIGN DOCUMENTATION

For each concept:
- describe composition system;
- list which cards were eliminated;
- identify each quantitative visualization;
- state source canonical fields used;
- prove no invented data;
- document any transformed chart semantic equivalence;
- typography scale;
- accessibility;
- SwiftUI implementation complexity;
- reusable locked-Home primitives.

PARITY VALIDATOR

Validate each concept against the canonical Weekly information contract:

- exact strings present;
- exact metrics present;
- canonical domain order preserved;
- no domain content moved across boundaries;
- no invented values;
- existing quantitative information preserved;
- Confidence exact;
- Recovery fixture boundary explicit;
- Coach's Take exact;
- Into Next Week exact;
- provenance exact.

Do NOT fail because visual geometry/components differ.

That is expected.

SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No theme implementation.
No build number.
No TestFlight.
No Recovery activation.
No policy changes.

Use disposable design harness only.

LOCK STATUS

Home:
LOCKED.

Log:
Compact Command Center dark + mineral light LOCKED.

Weekly:
NOT LOCKED.
This wide-leash creative pass replaces prior Weekly visual candidates.

BACKLOG

Record:
- prior Weekly creative pass rejected as too conservative/card-driven;
- wide-leash A/B/C Weekly exploration ready for Founder review when complete.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-weekly-ui-wide-leash-data-composition.md

Include:
- exact source authority;
- canonical information contract used;
- data-field inventory;
- A/B/C artifacts;
- quantitative visualization mappings;
- parity results;
- accessibility/implementation notes;
- confirmation shipping code unchanged.

STOP after the three dark concepts are ready for Founder review.

END TASK.
