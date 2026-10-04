PhysiqueOS UI exploration — selected Home refinement + Log page translation

TASK TYPE

Codex design exploration only.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not alter canonical projection/content semantics.
Do not design Weekly Briefing yet.
Do not implement the theme system yet.

FOUNDER WILL ATTACH ONE REFERENCE IMAGE DIRECTLY IN THIS CODEX CHAT

The image contains the currently preferred Home design in dark and light appearance side-by-side.

Treat that exact attachment as the visual authority for this task.

Do not substitute an earlier mockup.

OBJECTIVES

1. Apply the Founder’s final small corrections to the selected Home reference.
2. Treat the corrected Home as the visual-system reference.
3. Translate that visual system to the REAL current Log page.
4. Produce Log mockups in dark and light appearance.
5. Stop for Founder review before exploring Weekly Briefing or any other page.

PART A — HOME REFERENCE CORRECTIONS

Apply these exact corrections to BOTH dark and light Home references before using them as design-system authority.

A1. REMOVE REDUNDANT "BUILD LEAN MASS" LABELS

Current Home repeats the Goal identity excessively:

TRAJECTORY
BUILD LEAN MASS
Lean Mass Build

and later:

PRIMARY GOAL · BUILD LEAN MASS

This is redundant.

Change top hero to:

TRAJECTORY
Lean Mass Build

Remove the small "BUILD LEAN MASS" line beneath TRAJECTORY.

Change Goal area label from:

PRIMARY GOAL · BUILD LEAN MASS

to:

PRIMARY GOAL

The main title "Lean Mass Build" remains where appropriate.

Do not remove actual Goal identity from the page; remove only redundant repeated labels.

A2. PRIMARY GOAL LABEL COLOR

In dark appearance, PRIMARY GOAL currently uses a light purple that is difficult to read against the teal/navy field.

Use a darker/deeper purple treatment with sufficient contrast in the actual surrounding surface.

Important:
"dark purple" means visually deeper/more saturated than the current pale lavender, but it still MUST pass practical contrast on its background.

If a literal dark purple fails contrast on the dark teal surface, adjust the local background treatment or choose the darkest accessible purple that preserves the Founder’s intent.

Do not knowingly ship/mock an inaccessible color merely to satisfy a color name.

Apply a coherent corresponding treatment in light appearance.

A3. METRIC DIVIDERS + TEXT LEGIBILITY

Under Confidence are four metric columns:

Target
Remaining
Progress
Destination

The divider lines and labels/values are currently too visually faint against the hero color field.

Increase their visual presence / reduce transparency so they remain clearly legible.

Founder wording: "less opaque" meant the current faded treatment should become MORE visible/legible.

Interpret intent, not the accidental opacity terminology.

Requirements:
- stronger divider visibility;
- stronger label visibility;
- stronger value visibility;
- still subordinate to the hero title and Confidence;
- avoid harsh white lines.

Apply in dark and light.

A4. TARGET LABEL

Change:

TARGET

to:

TARGET DATE

in both appearances.

Preserve value:
Oct 31

This is a presentation-label clarification only.

A5. LARGE BACKGROUND RING

The large decorative/progress ring behind the Goal/Phase content is currently too dark/strong and visually clashes with the actual Confidence ring.

Make the large background ring more subtle / more transparent / visually recessive.

It must remain secondary atmospheric/progress geometry.

The actual Confidence ring must remain the dominant circular indicator.

Preserve correct 79% geometry where the background ring represents the same progress/confidence state.

Do not make it visually full.

Apply to dark and light.

A6. PRESERVE PREVIOUSLY ACCEPTED CORRECTIONS

Keep:
- Confidence = exact production "79% confidence";
- Briefing report/document icon, not trajectory arrow;
- Guardrail visually separate from the Phase 1 -> Phase 2 journey;
- Guardrail = persistent requirement, not next milestone;
- +5.8 of 10 lb belongs with Phase 2;
- semantic colors;
- Morning Weight + Briefing actions;
- Priority treatment;
- navigation structure.

PART B — FREEZE A DESIGN-SYSTEM REFERENCE

After corrections, document the selected Home visual grammar.

This is NOT yet a globally implemented design system.

Extract candidate rules for:

COLOR
- dark page base;
- dark hero teal/navy field;
- light warm/mineral page base;
- light hero mineral/teal field;
- brand purple role;
- teal;
- green;
- amber;
- Guardrail accent;
- action colors;
- surface/border colors;
- primary/secondary/tertiary text.

TYPOGRAPHY
- display/greeting;
- hero title;
- section label;
- action title;
- metric value;
- body;
- metadata;
- compact label.

SURFACES
- immersive hero field;
- action tiles;
- contained utility section;
- priority cards;
- open editorial content;
- borders/dividers;
- radius rules.

SPACING
- page margins;
- section rhythm;
- card padding;
- compact row spacing;
- touch target minimums.

ICONOGRAPHY
- report/document for Briefing;
- distinct Goal/Phase icons;
- SF Symbols or existing production icon strategy where possible.

Do not change shipping tokens.

PART C — LOG PAGE SOURCE AUDIT

Before designing Log, inspect the ACTUAL current Build 85/84 Native Log implementation and current production projection.

Use the latest shipping Native authority available in repo.

Inventory exactly what current Log shows and what actions exist.

Expected current concepts include, but source code is authority:
- "What happened?" header/intake framing;
- Logged Today summary;
- Training;
- Nutrition;
- Activity;
- Weight;
- Training Logger entry point;
- Log weight for another date;
- Upload / Add evidence;
- current bottom navigation;
- any processing/review states that can appear;
- empty/loading/error states relevant to Log.

Do not invent or remove product functionality.

Create one immutable realistic Log fixture from actual production projection/contracts.

Use that exact fixture across dark/light mockups.

PART D — LOG DESIGN PRINCIPLE

Do NOT copy the Home layout literally.

Translate the visual SYSTEM, not the Home composition.

Log is an execution/intake surface.

Optimize for:
1. immediate understanding of what has already been logged today;
2. fast access to Training Logger;
3. fast weight/date action;
4. fast evidence intake;
5. compact iPhone use;
6. legibility;
7. clear distinction between status/information and actions.

The Log page should feel unmistakably part of the same PhysiqueOS app as the selected Home, while being purpose-built for logging.

PART E — LOG EXPLORATIONS

Produce at least THREE Log compositions using the selected visual language.

E1 — DIRECT TRANSLATION

Closest to current production Log information architecture.

Improve:
- hierarchy;
- density;
- surfaces;
- typography;
- color semantics;
- action prominence.

This should be the safest evolution.

E2 — COMPACT COMMAND CENTER

More aggressively optimize vertical space.

Explore:
- compact "Today" status summary;
- strong Training Logger action;
- grouped quick actions;
- condensed evidence intake;
- less card stacking;
- clear status vs action distinction.

Do not hide useful information.

E3 — EDITORIAL / OPEN LOG

Use fewer containers.

Explore:
- open typography;
- colored action fields;
- line/group hierarchy;
- selective cards only for interactive elements;
- visually lighter Logged Today presentation.

Must still be practical and fast.

For EACH composition:
- render dark;
- render light.

So minimum Log output:
6 full-screen renders.

If one composition clearly cannot translate to both appearances, explain why and provide a strong alternative rather than a weak forced render.

PART F — LOGGED TODAY

Audit how much space Logged Today currently consumes.

Explore whether Training/Nutrition/Activity/Weight can be presented more compactly while preserving:

- category identity;
- primary value;
- important secondary metadata;
- source/provenance where production shows it;
- tappability if currently tappable.

Do not fabricate data.

Use actual realistic fixture values.

PART G — ACTION HIERARCHY

Training Logger is a high-frequency primary action and should visually read as such.

Evidence upload is important but should not compete equally with every action if actual usage/product hierarchy suggests otherwise.

Log weight for another date should remain discoverable.

Explore semantic color roles rather than making every action purple.

Do not alter behavior.

PART H — LIGHT APPEARANCE

Use the selected Home light appearance as the visual reference.

Do not use pure-white generic iOS styling.

Prefer:
- warm/mineral page base;
- ink/navy text;
- teal/mineral surfaces;
- restrained purple;
- semantic green/amber/teal;
- low-shadow or border-driven containment.

Maintain strong contrast.

PART I — DARK APPEARANCE

Use the selected Home dark appearance as the visual reference.

Prefer:
- deep navy page;
- teal/navy color fields;
- selective brighter action surfaces;
- reduced purple dominance;
- clear text hierarchy;
- subtle atmospheric geometry only where it serves Log.

Do not force the large Home ring motif onto Log unless it has an actual information purpose.

PART J — CONTENT PARITY

For every Log render prove:
- same canonical fields;
- same actions;
- same states;
- same values;
- same navigation destinations.

No semantic rewriting for aesthetics.

PART K — ACCESSIBILITY / REAL IOS

Use real target iPhone dimensions and safe areas.

Audit:
- point sizes;
- Dynamic Type;
- contrast;
- touch targets;
- VoiceOver order;
- selected tab state;
- scroll behavior;
- keyboard interaction implications for intake;
- loading/error/processing feasibility.

Do not use tiny copy to achieve density.

PART L — OUTPUT

Produce:

HOME REFERENCE
- corrected selected Home dark;
- corrected selected Home light.

LOG
- E1 dark + light;
- E2 dark + light;
- E3 dark + light.

COMPARISON
- Home corrected pair;
- Log three-way dark comparison;
- Log three-way light comparison;
- full-resolution individual renders.

For each Log direction provide:
- structural description;
- palette/tokens reused from Home;
- typography;
- surfaces;
- action hierarchy;
- vertical-space comparison to current production Log;
- implementation complexity;
- reusable existing components;
- new primitives required;
- accessibility notes;
- content-parity result.

PART M — WEEKLY BRIEFING

Do NOT design Weekly Briefing in this task.

At the end, include only a short note identifying which selected visual primitives from corrected Home + Log would likely carry into a future Weekly Briefing exploration.

No Weekly mockup yet.

PART N — SHIPPING ISOLATION

No shipping code changes.
No global theme/token changes.
No build-number change.
No TestFlight.
No Server changes.
Do not interfere with Build 85 Watch acceptance.

Use disposable preview/design harnesses only.

PART O — BACKLOG

Update App-wide UI/design polish:
- selected Home direction under refinement;
- Log exploration ready for Founder review;
- Weekly Briefing explicitly next/later, not started.

Do not mark Home or Log design accepted yet.

PART P — REPORT

Publish:
agent-handoffs/reports/<timestamp>-ui-selected-home-log-exploration.md

Include:
- exact Native source authority;
- attached reference role;
- corrected Home artifact locations;
- actual Log source audit;
- immutable Log fixture;
- Log artifact locations;
- content-parity results;
- light/dark feasibility;
- accessibility notes;
- implementation complexity;
- confirmation shipping code unchanged.

Follow mandatory GH-main protocol.

STOP after corrected Home + Log artifacts are ready for Founder review.

END TASK.
