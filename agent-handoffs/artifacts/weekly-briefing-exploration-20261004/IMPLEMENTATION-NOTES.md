# Weekly composition notes

No direction is ranked or accepted.

## Shared locked visual grammar

- Plus Jakarta Sans, matching the locked exploration references; shipping Native can continue using the existing font token rather than adding a family.
- Dark: deep navy page and surfaces, teal/navy lead fields, green strategy/progress, amber limitations, restrained purple identity labels.
- Mineral light: mineral canvas, white/mineral surfaces, ink navy text, teal/green operational color, amber evidence limits, restrained purple identity.
- 402-point iPhone target, Dynamic Island safe region, 22-point primary horizontal inset, 13-point canonical body copy.
- Shape vocabulary: 14–24 point content radii; the long editorial option uses rules and open fields to avoid turning every thought into a card.
- State never depends on color alone. Labels, values and explanatory copy accompany every semantic color.

## 01 · Structured Editorial

Composition: integrated color-field lead, side-by-side Result/Meaning, one action band, ordered evidence chapters, dedicated Recovery field, Do/Watch split, complete Confidence detail and Coach close.

What it tests: the closest translation of the existing Weekly section order into the locked visual language while reducing the current succession of equally weighted containers.

Likely reuse:

- existing `WeeklyBriefingSections` ordering;
- existing section visibility and destination logic;
- existing confidence and strategy models;
- shared label, divider, metric and callout tokens from the locked Home/Log grammar.

Estimated implementation complexity: **medium**. Mostly presentation restructuring; no contract change for current sections. The future Recovery section remains separately gated.

Accessibility / Dynamic Type: the two-column Result/Meaning field should collapse to one column at accessibility sizes; the evidence label column should stack above body copy. Complete long-page height is 4065 pt in both appearances at the design size.

## 02 · Executive Brief

Composition: compact hero, decision-first Result/Do/Watch rail, explicit strategy strip, four-cell command view, Recovery snapshot plus complete later section, detailed analysis, complete Confidence and Coach close.

What it tests: maximum top-of-page scan efficiency while retaining every canonical field lower in the document. The Recovery snapshot is a presentation reference to the same future fixture, not a second assessment.

Likely reuse:

- current presentation service data without semantic changes;
- reusable metric tiles and status strips;
- Home/Log command-center geometry and semantic color tokens;
- existing detail navigation and loading/failure shell.

Estimated implementation complexity: **medium-high**. It needs a new responsive command-grid component and careful duplicate-reference accessibility semantics.

Accessibility / Dynamic Type: the three-column Result/Do/Watch rail must become a vertical sequence before text truncates; the four-cell command view becomes one column. Complete long-page height is 3715 pt in both appearances, the shortest of the three only because the top summary is denser—not because content was removed.

## 03 · Coaching Story

Composition: full-width lead, Confidence ribbon, numbered Result/Meaning/Action/Recovery chapters, an evidence interlude, a dedicated Watch field, complete Confidence evidence and an editorial Coach close.

What it tests: a story-led Weekly reading flow with fewer card boundaries and stronger narrative pacing. It departs most from Home and Log composition while retaining their palette, typography and semantic accents.

Likely reuse:

- existing canonical narrative fields and section availability;
- open-divider primitives and type tokens;
- existing Recovery future-contract shape when authorized;
- existing detail navigation.

Estimated implementation complexity: **high**. It needs a distinct briefing-specific layout system, adaptive chapter rails and deliberate focus order.

Accessibility / Dynamic Type: chapter numbers are decorative; VoiceOver order stays label → headline → canonical body. The evidence label/value grid stacks at larger sizes. Complete long-page height is 4114 pt in both appearances.

## Recovery implementation caveat

None of these views can ship Recovery by styling alone. A future implementation requires the approved additive Server contract, prospective evidence policy, section availability rules, Native mapping, loading/unavailable behavior, accessibility labels and an explicit release gate. The mockup does not authorize any of those changes.

