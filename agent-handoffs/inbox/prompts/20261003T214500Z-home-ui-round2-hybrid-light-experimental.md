PhysiqueOS Home UI exploration — Round 2 hybrid + experimental directions + light appearance feasibility

TASK TYPE

Codex design exploration only.

Do not modify shipping Native UI.
Do not create a TestFlight build.
Do not change Server behavior.
Do not change canonical Home projection semantics.
Do not begin app-wide light-mode implementation yet.

FOUNDER WILL PROVIDE TWO ROUND-1 MOCKUPS DIRECTLY IN THIS CODEX CHAT

Treat those two user-supplied images as the exact visual anchors for Round 2.

Anchor A:
the light/card-based Home concept.

Anchor B:
the dark/compact/line-based Home concept.

Do not substitute other Round-1 directions.
Do not regenerate from memory if the user images are present.
Iterate from those exact two concepts.

GOAL

Produce a second round of Home designs that:

1. synthesizes the strongest elements from the two preferred Round-1 concepts;
2. preserves exact production content semantics;
3. explores a real iOS light appearance opportunity;
4. adds several genuinely more experimental/outside-the-box directions;
5. remains implementable in SwiftUI and consistent with PhysiqueOS product structure.

HARD CONTENT-PARITY RULE

Visual presentation may change.

Canonical content projection may NOT change.

Every concept must use the same immutable Home projection fixture derived from real production Home content.

Do not:
- rewrite canonical text;
- invent or substitute labels;
- reinterpret Goal Confidence;
- invent dates;
- alter Goal/Phase/Guardrail meaning;
- alter Priority state;
- alter Briefing type/title/date semantics;
- alter progress values;
- hide required information merely to make the mockup cleaner.

Round-1 error to avoid:

79% + MODERATE

was not equivalent to production:

79% confidence

If production projects "79% confidence", all concepts must preserve that exact semantic value/label.

Before rendering:
- derive one immutable Home fixture from current production projection;
- document the fixture fields;
- use the same fixture across every concept;
- run a parity checklist proving each concept shows the same required semantic content.

PREFERRED HYBRID DIRECTION

Create at least TWO refined hybrid variants using the two Founder-selected Round-1 anchors.

Use these explicit Founder preferences:

HERO / CONFIDENCE

Prefer the contained hero/confidence CARD from the light concept.

Founder likes:
- clearer containment;
- confidence ring/card hierarchy;
- card separation;
- readability.

Explore:
- one dark/navy hybrid;
- one light/warm-neutral hybrid.

Preserve exact production confidence wording and semantics.

BRIEFING

The dark concept's briefing section adds too many lines/separators.

Replace Latest Briefing with a BUTTON or ACTION CARD.

Requirements:
- clearly tappable;
- intentional accent color;
- no narrative preview text on Home;
- preserve exact latest Briefing title/type/date semantics;
- reduce line clutter;
- do not make it look like another passive section.

Produce at least:
- one compact full-width briefing action;
- one slightly more distinctive/button-like treatment.

GOAL / PHASE / GUARDRAIL

Founder prefers the dark concept's tighter, cleaner goal presentation.

Use that compact hierarchy as the baseline.

Do not re-expand it into large stacked cards unless a concept intentionally explores a different direction.

Keep:
- Primary Goal;
- progress/destination;
- Phase 1;
- Phase 2;
- Guardrail;
- exact production semantics.

Optimize vertical density without reducing legibility.

PRIORITIES

Founder prefers the light concept's Priority controls/cards.

These are closer to current production behavior and should remain immediately actionable.

Use compact cards or grouped controls rather than the dark concept's overly line-driven list for the primary hybrid.

Retain:
- clear tap targets;
- visual completion/skip affordances where appropriate;
- strong distinction between Priority rows;
- exact production Priority content/state.

LINES VS CARDS

Founder likes the light concept's use of cards for section separation.

Founder likes the dark concept's compactness.

The hybrid should reduce unnecessary horizontal dividers by using:
- cards where containment helps;
- open/line treatment only where it genuinely improves density.

Do not create a page made entirely of cards.
Do not create a page made entirely of separators.

TYPOGRAPHY

Audit current production Home typography from code and compare against Round-1 concepts.

Founder generally likes current font family.

Focus on:
- consistent size scale;
- fewer arbitrary weight changes;
- more disciplined label/title/body hierarchy;
- preserving readability.

Do not introduce a new font family unless there is an unusually strong reason.

COLOR

Founder likes dark navy but believes PhysiqueOS may be overusing purple.

For the hybrid:
- keep purple as a meaningful brand/accent color;
- reduce its use as the default accent for every control/state;
- use semantic colors intentionally (e.g. green, teal/cyan, amber, blue) where appropriate;
- avoid decorative rainbowing.

LIGHT APPEARANCE OPPORTUNITY

This is the first deliberate exploration of a true iOS light appearance for PhysiqueOS.

Do NOT merely invert the dark palette.

Audit current Native styling implementation:
- hard-coded colors;
- explicit preferredColorScheme/.dark usage;
- Asset Catalog color sets;
- semantic color tokens;
- reusable card/surface tokens;
- navigation/tab-bar appearance;
- UIKit appearance hooks if any;
- shared SwiftUI modifiers/components.

Determine whether current architecture is:
A. already theme-capable;
B. partially theme-capable;
C. substantially hard-coded dark.

Provide an implementation-feasibility assessment for supporting BOTH system light and dark appearance eventually.

The light Home concept should:
- still feel unmistakably PhysiqueOS;
- use warm/soft neutral background rather than sterile pure white if that works better;
- preserve strong contrast;
- use dark navy/ink text;
- use restrained purple/teal/green/amber accents;
- keep cards distinct without excessive shadows;
- retain current information hierarchy and exact semantics;
- respect iOS safe areas and accessibility.

Do not implement app-wide appearance switching yet.

Instead provide:
- required token architecture;
- likely files/components affected;
- whether existing semantic color assets can be extended;
- estimated complexity for Home-only light mode;
- estimated complexity for full-app system appearance;
- risks from screenshots/images/charts/third-party surfaces;
- whether any current components assume dark backgrounds.

OUTSIDE-THE-BOX EXPLORATION

Round 1 did not go far enough.

Create at least THREE concepts that meaningfully challenge the current visual system while preserving exact Home information and product semantics.

They should not simply recolor the same layout.

Examples of acceptable exploration:
- hero-first editorial layout with fewer visible containers;
- modular dashboard with asymmetric hierarchy;
- translucent/material surfaces used selectively;
- edge-to-edge color field with inset content groups;
- split-status architecture where confidence/goal state is visually dominant and execution sits beneath;
- different treatment of the phase/guardrail story;
- dramatically different but still practical use of cards vs open space.

At least one experimental direction should:
- challenge the heavy-card model.

At least one should:
- explore a significantly different color architecture.

At least one should:
- explore a substantially different hierarchy/order while preserving all required information.

Do not make them generic fitness-app designs.
They must still reflect actual PhysiqueOS concepts:
Goal, Phase, Guardrail, Briefing, Priorities, Confidence.

Do not alter tab structure or product IA unless clearly marked as an experiment, and do not treat such IA changes as accepted.

REQUIRED ROUND-2 SET

Produce at minimum:

1. Hybrid Dark
2. Hybrid Light
3. Hybrid Compact variation
4. Experimental A
5. Experimental B
6. Experimental C

Also show the current production Home baseline and the two Founder-selected Round-1 anchors in the comparison artifact if available.

RENDERING

Use actual iPhone dimensions and safe areas.

Prefer SwiftUI preview/disposable design harness grounded in real Home components/tokens where practical.

Do not mutate shipping Home merely to render mockups.

Render:
- full-screen screenshots;
- above-the-fold crops where useful;
- comparison board/gallery;
- light/dark side-by-side where applicable.

For each concept provide:
- palette with color values;
- typography scale;
- spacing/radius/surface rules;
- what changed;
- what stayed;
- implementation complexity;
- reuse of existing components/tokens;
- accessibility/Dynamic Type notes;
- estimated vertical-space impact;
- content-parity confirmation.

DESIGN SYSTEM / LIGHT-MODE AUDIT

Publish a concise code-grounded audit covering:
- current color token architecture;
- hard-coded dark assumptions;
- current typography inconsistencies;
- spacing/card/radius inconsistencies;
- purple concentration;
- duplicated modifiers/tokens;
- barriers to a system light appearance;
- recommended semantic token model.

Do not fix these yet.

OUTPUT / ARTIFACTS

Store rendered artifacts somewhere durable/easy for Founder inspection from phone/Remote Control.

Publish a GH report with:
- exact Native/Home source authority;
- immutable Home fixture used;
- content-parity proof;
- artifact locations;
- description of each concept;
- light-mode feasibility assessment;
- implementation complexity;
- no shipping-code-change confirmation.

Update durable backlog:
App-wide UI/design polish = Home Round 2 exploration in progress/ready for Founder review.
Do not mark any direction accepted.

STOP after mockups and report are ready for Founder review.

END TASK.
