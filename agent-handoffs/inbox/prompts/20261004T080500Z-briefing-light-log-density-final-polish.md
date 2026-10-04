PhysiqueOS design system — final briefing-light polish + Weekly muscle-group compaction + Log source-density validation

TASK TYPE

Codex design refinement only.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not alter canonical briefing content, briefing section ordering, Confidence semantics, Recovery semantics, Log behavior, or evidence semantics.
Do not activate Recovery.
Do not implement the final design system yet.

CURRENT LOCKED DESIGN STATUS

HOME
Locked:
- dark;
- mineral light.

LOG
Locked direction:
- Compact Command Center;
- dark;
- mineral light.

WEEKLY
Locked visual family:
- Immersive Story hero;
- Dense Analytical body;
- dark and mineral-light direction accepted structurally;
- recurring-section refinements accepted.

MIDWEEK
Locked recurring-family visual direction:
- same briefing family as Weekly;
- dark and mineral-light direction accepted structurally.

This task is a POLISH + REALISTIC-DENSITY validation pass.

FOUNDER FEEDBACK

1. Mineral-light briefing pages still risk becoming a wall of white/light surfaces.

The locked Home and Log avoid this because selective colored boxes/surfaces provide contrast and visual rhythm.

Founder wants that same principle applied to Weekly/Midweek mineral light.

Do NOT make every section a card.

Do NOT mechanically alternate colors just for pattern.

Use colored/tinted fields where they improve:
- grouping;
- hierarchy;
- visual rhythm;
- scanability;
- section identity.

2. Weekly Priority Muscle Groups are still awkwardly laid out and vertically wasteful.

They should be substantially more condensed and easier to scan.

3. Bring the LOCKED Log Compact Command Center into this refinement pass and validate it against realistic content density, including:
- Strength Training + Cardio simultaneously;
- Nutrition calories + macros;
- Activity;
- Weight;
- source/provenance handling;
- evidence-review state.

4. Repeated "Apple Health" source text inside individual Logged Today tiles is undesirable.

Prefer a compact centralized source/provenance treatment that accurately communicates which visible data came from Apple Health without bloating each tile.

PART A — MINERAL-LIGHT BRIEFING SURFACE RHYTHM

Applies to:
- Weekly mineral light;
- Midweek mineral light.

DARK
Do not redesign accepted dark versions.

LIGHT GOAL

Reduce the visual impression of one continuous white/mineral sheet.

Use the locked Home/Log mineral-light visual language:
- warm/mineral base;
- pale teal/mineral;
- soft blue/teal;
- restrained purple;
- semantic green;
- semantic amber;
- ink/navy text;
- low-shadow, border-driven hierarchy.

SELECTIVE CONTAINMENT

Codex may use:
- lightly tinted section fields;
- subtle contained panels;
- inset chart surfaces;
- colored accent bands;
- selective full-width fields;
- grouped analytical blocks.

Do not:
- make every domain a white card;
- add heavy shadows;
- introduce loud unrelated colors;
- change content or section order.

Founder suggestion:
"Maybe every other to break it up or something?"

Interpret intent, not literally.

Choose the distribution based on hierarchy.

A good result should have:
- clear visual rhythm;
- 2–4 distinct surface families;
- enough neutral/open canvas to stay clean;
- enough tinted contrast to avoid wall-of-white.

Candidate areas where a tinted field MAY make sense:
- Energy;
- Training;
- Recovery;
- Coach's Take/finale;
- Body Composition;
depending on best composition.

Charts must remain legible.

Do not put tint behind long text if it reduces contrast.

PART B — WEEKLY PRIORITY MUSCLE GROUPS COMPACTION

Current issue:
Priority Muscle Groups are visually stacked in a way that consumes too much vertical space.

Founder wants this condensed substantially.

Preserve exact:
- muscle-group names;
- status/interpretation;
- comparable exercise counts;
- any canonical labels/data.

Do not remove information.

Explore compact layouts such as:

OPTION 1
Two-column left-aligned grid:
Chest | Back
Shoulders | Legs

Each compact row/group shows:
- group name;
- short status;
- comparable count;
- thin semantic indicator.

OPTION 2
Compact 2x2 analytical rail:
each cell has
name + status + count + small progress/semantic line.

OPTION 3
Full-width rows with group name/status/count aligned horizontally.

Prefer whichever:
- scans fastest;
- avoids awkward wrapping;
- saves meaningful height;
- remains Dynamic Type feasible.

Hard requirements:
- no centered multiline lists;
- no narrow stacked paragraphs;
- no tiny type;
- left/natural alignment;
- exact canonical content preserved.

Compare old vs new section height in points.

Target:
meaningful vertical reduction without sacrificing legibility.

Apply the selected compact treatment to Weekly.
Use same component family in Midweek if/when that content exists.

PART C — LOG REALISTIC DENSITY VALIDATION

Use LOCKED Log:
Compact Command Center.

Do NOT reopen Log composition selection.

Refine only what is necessary to prove the locked design works with realistic daily content.

SOURCE AUTHORITY

Inspect current Build 85 Log implementation and actual canonical projection.

Use real current field structure.

Do not fabricate behavior.

Create a realistic "busy but normal" Logged Today fixture that includes:

TRAINING
- Traditional Strength Training;
- a cardio workout in the SAME day;
- use Stair Stepper as the example if it maps cleanly to current canonical workout types;
- show durations for both;
- ensure Cooldown is NOT shown as Cardio if product semantics still exclude it.

NUTRITION
- calories;
- Protein;
- Carbs;
- Fat;
- use actual canonical macro ordering/labels from production;
- test realistic 3-digit macro values.

ACTIVITY
- active calories so far.

WEIGHT
- current weight.

EVIDENCE REVIEW
- include a realistic "ready to review" state if current Log supports it.

TRAINING LOGGER
- retain locked high-priority Training Logger action.

QUICK ACTIONS
- Log weight for another date;
- Add evidence;
- Add details without an asset;
- preserve current behavior.

PART D — LOGGED TODAY COMPOSITION

The locked Compact Command Center uses compact summary cells.

Ensure it remains clean with:

Training tile:
Strength Training · 64 min
Stair Stepper · 13 min

or another canonical compact layout that preserves both sessions.

Do not merge them into one misleading duration.

Nutrition tile:
2,516 calories
215P · 161C · 111F

Use exact fixture values if available; otherwise use a realistic clearly design-only fixture derived from current canonical field schema.

Activity:
771 active calories so far

Weight:
176.7 lb

Do not shrink type to force fit.

If the 2x2 composition cannot hold this content comfortably, make the smallest layout refinement necessary while preserving the locked Compact Command Center identity.

Examples:
- allow Training and Nutrition cells slightly taller;
- use 2-row metric hierarchy;
- adjust internal spacing;
- maintain same overall command-center structure.

Do NOT redesign Log into another concept.

PART E — SOURCE / PROVENANCE TREATMENT

Founder concern:
repeating "Apple Health" inside Training, Nutrition and Activity tiles wastes space and clutters the locked design.

Goal:
centralize source/provenance while keeping it clear and truthful.

Audit actual source combinations.

Design a compact treatment such as:

Evidence Sources
Apple Health · Training, Nutrition, Activity
PhysiqueOS · Weight

or:
Sources
Apple Health: Training · Nutrition · Activity
PhysiqueOS: Weight

This is illustrative only.

Use actual source/provenance semantics from the fixture.

Do not claim PhysiqueOS for Weight if the real source is different.

If all visible categories share Apple Health except one, represent that accurately.

Placement options:
- directly beneath Logged Today grid;
- compact footer row inside Logged Today;
- small expandable "Sources" row if existing interaction patterns support it;
- page-bottom source note ONLY if still discoverable.

Founder preference:
put source/provenance at the bottom so Logged Today tiles stay clean.

Choose the best placement that remains obvious enough.

Hard requirements:
- no repetitive source text inside each tile unless a category has a materially different source that cannot be represented centrally;
- provenance remains available;
- source scope is understandable;
- scales to multiple sources;
- no source ambiguity;
- no invented source mapping.

PART F — LOG DARK + LIGHT

Render the refined locked Compact Command Center in:
- dark;
- mineral light.

Use exact same content fixture.

Require:
- identical structure;
- identical content;
- identical sources;
- same action hierarchy.

PART G — BRIEFING LIGHT OUTPUT

Produce:
1. Weekly mineral-light full-length refined;
2. Midweek mineral-light full-length refined;
3. comparison with previous accepted mineral-light pair;
4. focused Weekly Priority Muscle Groups before/after;
5. Weekly Recovery light viewport;
6. Midweek Recovery light viewport;
7. Weekly Coach/finale light viewport;
8. Midweek Coach/finale light viewport.

Do not re-render dark except as side reference if needed.

PART H — LOG OUTPUT

Produce:
1. Log Compact Command Center dark full;
2. Log Compact Command Center mineral light full;
3. Logged Today dark focused viewport;
4. Logged Today light focused viewport;
5. source/provenance treatment detail;
6. comparison with prior locked Log mockup.

PART I — VALIDATION

BRIEFINGS
- exact canonical content preserved;
- exact section order;
- exact graphs/data;
- Photos absent;
- Still Unresolved absent;
- Recovery exact future-contract presentation;
- Body Composition placement unchanged;
- Weekly Priority Muscle Groups exact semantic content;
- reduced Priority Muscle Group section height measured;
- no accessibility regression.

LOG
- Strength + Cardio both present;
- Cooldown not misclassified as Cardio;
- Nutrition macros present;
- Activity present;
- Weight present;
- provenance accurate;
- no repeated Apple Health clutter unless unavoidable;
- action hierarchy unchanged;
- content fits without tiny type;
- dark/light parity exact.

PART J — ACCESSIBILITY

Check:
- minimum readable point sizes;
- Dynamic Type;
- VoiceOver grouping;
- source/provenance spoken clearly;
- tinted light surfaces maintain contrast;
- charts remain accessible;
- muscle-group compact layout collapses gracefully.

PART K — SHIPPING ISOLATION

No shipping code changes.
No Server changes.
No theme implementation.
No build number.
No TestFlight.
No Recovery activation.
No evidence policy changes.

Use disposable design harness only.

PART L — LOCK / BACKLOG

If this refinement is accepted later:

Weekly/Midweek:
light appearance polish can be considered locked.

Weekly Priority Muscle Groups:
compact layout candidate ready.

Log:
Compact Command Center remains locked, with realistic-density/source refinement candidate ready.

Do not mark final implementation complete.

Record backlog:
- centralized Log source/provenance;
- realistic Strength + Cardio + macro density;
- condensed Priority Muscle Groups;
- briefing mineral-light surface rhythm.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-briefing-light-log-density-final-polish.md

Include:
- exact authorities;
- artifact paths;
- old/new Priority Muscle Group height;
- source/provenance fixture mapping;
- dark/light Log parity;
- briefing light surface token choices;
- accessibility result;
- confirmation shipping code unchanged.

STOP after artifacts are ready for Founder review.

END TASK.
