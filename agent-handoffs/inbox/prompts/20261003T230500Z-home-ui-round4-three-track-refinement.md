PhysiqueOS Home UI exploration — Round 4 three-track refinement

TASK TYPE

Codex design exploration only.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not alter canonical Home projection semantics.
Do not start Log-page redesign yet.
Do not collapse the three tracks into one.

FOUNDER DECISION

Three Home directions remain active and should advance in parallel.

Treat each as a distinct design track.

Do not introduce new unrelated concepts in this round.

The goal is refinement, correction, dark/light parity where requested, and implementation feasibility.

REFERENCE IMAGES

Founder will attach the exact three images directly in the Codex chat.

Treat them as the visual authority for:
Track 1
Track 2
Track 3

Do not substitute prior renders or regenerate from memory.

HARD CONTENT-PARITY RULE

Canonical production projection must remain exact.

Do not change:
- Goal identity;
- Confidence semantics;
- target;
- remaining;
- progress;
- destination;
- Phase 1 content;
- Phase 2 content;
- Guardrail content;
- Briefing title/type/date;
- Priority names/details/states;
- navigation labels;
- open counts.

Presentation may change.
Semantics may not.

If production says "79% confidence", preserve "79% confidence".

Do not invent Moderate or another confidence band unless production actually projects it.

Use one immutable production-derived Home fixture for all renders and verify parity.

TRACK 1 — STRUCTURED CARD HYBRID

Reference:
the three-up set where the third/light version uses an edge-to-edge trajectory banner, compact Goal content, Morning Weight button, Briefing action card, Priority card controls and warm-light background.

FOUNDER POSITION:
This track is very strong.

LIGHT VERSION:
Treat the third/light image in that set as effectively LOCKED for structure/layout in this round, except for the explicit corrections below.

Do not redesign its composition.

Required corrections:

1. GOAL ITEM COLORS
Phase 1 / Phase 2 / Guardrail must each use distinct semantic colors.

Current problem:
Guardrail visually reuses the same maintenance/Phase-1 amber language.

Requirement:
- Phase 1 = one color;
- Phase 2 = a clearly different color;
- Guardrail = a third clearly different color.

Colors must remain cohesive and accessible.

Do not rainbow the interface.

2. BRIEFING ICON
Lean Mass Build/Phase 2 currently uses an upward-arrow icon.

The Briefing action uses an icon that reads too similarly.

Change the Briefing icon to something report/document/briefing-specific.

Possible direction:
- document;
- report;
- note;
- text/page;
- newspaper-like glyph.

It should communicate "briefing/report", not progress/trajectory.

3. DARK VERSION
Create a true dark-mode equivalent of this locked light design.

Important:
The top trajectory/banner treatment in dark mode should extend visually to the edges in the same manner as the light reference's third concept.

Do not merely place the same content inside a floating dark card.

Translate the same structural system into dark:
- edge-to-edge or near-edge trajectory/banner field;
- Morning Weight directly beneath;
- Latest Briefing directly beneath Morning Weight;
- compact Goal;
- Priority controls/cards;
- same semantic colors adapted for dark contrast.

Use dark navy/ink as the page base.

Reduce purple dominance.

4. PRESERVE ORDER
Top order must remain:
Trajectory
Morning Weight
Latest Briefing
Primary Goal
Today's Priorities

TRACK 2 — EDITORIAL TIMELINE

Reference:
light editorial/open-canvas concept with:
- large text-driven trajectory;
- 79% confidence as large type;
- Morning Weight + Briefing side-by-side;
- Primary Goal;
- vertical Phase 1 -> Phase 2 journey;
- Guardrail currently shown as a third timeline node;
- Priority card below.

FOUNDER POSITION:
Intriguing and should continue.

Required work:

1. DARK VERSION
Create a carefully designed dark-mode version.

Do not simply invert colors.

Retain:
- editorial/open-canvas feel;
- strong typography;
- lower card density;
- timeline storytelling;
- side-by-side Weight + Briefing concept if it remains legible.

Use navy/charcoal surfaces and semantic accents.

2. GUARDRAIL IS NOT A JOURNEY STEP
Current problem:
Guardrail appears as the third point after Phase 2, implying it is a future milestone to reach.

That is semantically wrong.

Guardrail must read as a persistent requirement spanning the Goal/Phases.

Explore a visual treatment such as:
- a parallel rail beside the phase timeline;
- a bracket or side band spanning Phase 1 through Phase 2;
- a separate horizontal constraint panel beneath/alongside the timeline;
- a persistent labeled rule separated by a divider;
- another clearly distinct visual that says "maintain throughout", not "next step".

Do not show Guardrail as a third dot/node on the phase path.

3. PHASE STORY
Phase 1 -> Phase 2 may remain as the two-step timeline.

Preserve exact phase semantics.

4. TYPOGRAPHY
Keep the editorial hierarchy, but audit whether any text drops below comfortable iPhone legibility/Dynamic Type feasibility.

Do not optimize only for the static screenshot.

TRACK 3 — IMMERSIVE TRAJECTORY

Reference:
dark ambitious concept with:
- large teal/navy hero field;
- large confidence ring;
- large background progress/ring geometry;
- compact phase timeline over hero;
- Weight + Briefing side-by-side;
- Priorities below.

FOUNDER POSITION:
Most ambitious.
Likes how compactly it delivers information.
Concerned some copy may be too small.

Continue this track.

Required corrections:

1. MOVE "+5.8 OF 10 LB"
Current placement on the far-right side feels detached.

Move this text to the left under / within the Phase 2 "Lean Mass Build" content cluster.

It should visually belong to Phase 2 progress.

Do not leave it floating separately on the right edge.

2. GUARDRAIL NOT A TIMELINE POINT
Same semantic problem as Track 2.

Guardrail must not appear as another future node after Phase 2.

It must read as persistent across the entire goal.

Explore:
- background rule band;
- side constraint rail;
- persistent guardrail chip/panel;
- bracket spanning phases;
- separate embedded constraint area;
- another unmistakably non-sequential treatment.

3. CONFIDENCE RING GEOMETRY
The visible confidence wheel at the top must show 79%, not a visually full ring.

The large background progress/ring geometry must visually match the same 79% state.

Do not draw a full circle if canonical confidence is 79%.

Ensure the ring's completion arc is actually 79% in geometry.

4. LEGIBILITY
Audit every text style.

Founder concern:
some copy may be too small.

Minimum goal:
retain the compact Home but increase any text that would fail realistic iPhone legibility or Dynamic Type feasibility.

Do not make compactness depend on tiny copy.

Provide:
- actual point-size mapping;
- Dynamic Type behavior;
- contrast review;
- VoiceOver order.

5. LIGHT VERSION
Create a light-mode version only if the concept can translate without losing its immersive identity.

If a light translation becomes weak/generic, say so rather than forcing it.

If rendered:
- use warm neutral / pale mineral background;
- preserve immersive trajectory geometry;
- maintain strong contrast;
- avoid sterile white.

CROSS-TRACK REQUIREMENTS

For ALL tracks:

BRIEFING
- action/button treatment;
- no narrative preview;
- briefing/report icon, not trajectory-arrow icon.

CONFIDENCE
- exact production semantics;
- exact geometry when a visual meter is shown.

GUARDRAIL
- persistent cross-phase requirement;
- never visually imply "next milestone".

COLOR
- reduce purple dominance;
- use distinct semantic colors with discipline;
- maintain coherence across light/dark.

TYPOGRAPHY
- audit real iOS point sizes;
- flag anything likely too small;
- propose minimum comfortable sizes;
- no loss of Dynamic Type feasibility.

PRIORITIES
- remain immediately actionable;
- retain current production semantics;
- preserve clear tap targets.

REAL IOS
Use actual iPhone target dimensions/safe areas.

Respect:
- Dynamic Island;
- tab bar;
- practical touch targets;
- VoiceOver ordering;
- Dynamic Type;
- contrast.

REQUIRED OUTPUTS

TRACK 1
- refined light final candidate;
- matching dark candidate.

TRACK 2
- refined light candidate with corrected Guardrail semantics;
- dark candidate.

TRACK 3
- refined dark candidate with all corrections;
- optional light candidate only if genuinely strong.

Also create:
- side-by-side comparison board;
- full-resolution individual screens;
- implementation-complexity notes;
- typography scale;
- palette;
- surface model;
- spacing/radius rules;
- exact content-parity results;
- accessibility notes.

Do not rank a winner.

DESIGN-SYSTEM NOTE

For each track, identify which visual rules could become reusable app-wide primitives if later accepted:
- Hero/trajectory surface;
- Action button/card;
- Section header;
- Goal/phase row;
- Guardrail treatment;
- Priority row/card;
- navigation/background/surface tokens.

LOG PAGE — NEXT STEP, NOT THIS TASK

Founder expects Log to be the next page explored after Home because Home and Log are the two most-used pages.

Do NOT design Log yet.

Instead, at the end of the report include a short "Log translation readiness" section for each track:
- what visual primitives would naturally carry to Log;
- potential risks;
- whether the track is strong enough to test on Log next.

No Log mockups in this round.

SHIPPING ISOLATION

No shipping Home changes.
No global token changes.
No build-number change.
No TestFlight.
No Server changes.
Do not interfere with Build 85 Watch work.

BACKLOG

Update App-wide UI/design polish:
Home Round 4 — three-track refinement ready for Founder review.

Do not mark any track accepted.

REPORT

Publish:
agent-handoffs/reports/<timestamp>-home-ui-round4-three-track-refinement.md

Include:
- exact Native source authority;
- reference-image roles;
- immutable production fixture;
- content parity;
- all artifact locations;
- typography/accessibility audit;
- Guardrail semantic treatment per track;
- Confidence geometry verification;
- light/dark feasibility;
- Log translation readiness;
- confirmation shipping code unchanged.

Follow mandatory GH-main protocol.

STOP after Round 4 artifacts are ready for Founder review.

END TASK.
