# Home UI Exploration Round 3 — convergence and provocation

Date: 2026-10-03  
Status: **Ready for Founder review; no direction accepted or ranked**  
Artifact commit: `a3750a507cc8732ec58b6c87be16394443e67973`

## Authority and reference roles

- Round 3 prompt authority: `db9aa98b88baef8186ea8e5eda493588744e3be5`
- Native Build 84 source authority: `bcd92c74602695766c270fe6af052de45afece4b`
- [References 1 and 2](../artifacts/home-design-round3-20261003/screens/reference-1-2-preferred-pair.jpg): exact attached preferred dark/light pair; structural authority for Lane A.
- [Reference 3](../artifacts/home-design-round3-20261003/screens/reference-3-teal-field.jpg): exact attached teal/navy color-field direction; color/hierarchy cue only, not accepted wholesale.
- [Immutable fixture](../artifacts/home-design-round3-20261003/FIXTURE.json): the same production-derived Home projection used in every concept.

The convergence lane preserves the required top order in every concept: Trajectory / Confidence → Log Morning Weight → Latest Briefing → Goal. Briefing remains an action with exact type/title/date and no visible narrative preview.

## Founder review artifacts

- [Review index](../artifacts/home-design-round3-20261003/README.md)
- [Complete comparison board](../artifacts/home-design-round3-20261003/comparison-board.html)
- [Convergence triptych](../artifacts/home-design-round3-20261003/screens/convergence-triptych.png)
- [Grayscale structural-difference sheet](../artifacts/home-design-round3-20261003/screens/structural-grayscale-test.png)
- [Structural test details](../artifacts/home-design-round3-20261003/STRUCTURAL-DIFFERENCE.md)
- [Content-parity proof](../artifacts/home-design-round3-20261003/CONTENT-PARITY.md)
- [Light-mode feasibility delta](../artifacts/home-design-round3-20261003/LIGHT-MODE-FEASIBILITY.md)
- [Full comparison-board overview](../artifacts/home-design-round3-20261003/screens/comparison-board-overview.png)

The review index links every full-page screenshot and every exact 402 × 874 pt above-the-fold render individually for phone/Remote Control inspection.

## Content parity

The renderer validates 52 exact semantic fields in every concept: Founder greeting/name, complete trajectory/confidence/target/remaining state, next action, Briefing type/title/date/prompt, Goal/progress/destination/date range, both phases and statuses/timing/progress, Guardrail and observation, all priorities/details/states/open count, and all five navigation labels.

Result: **52/52 fields present, zero mismatches in all seven concepts.** The prompt remains in the fixture and is progressively disclosed behind the Briefing action. `79% confidence` is preserved; `Moderate` is never substituted.

## Lane A — convergence

### A1 Preferred Dark — Color Field

The preferred dark architecture remains intact. The bounded hero becomes a richer petrol/teal-to-navy field; purple is retained as brand punctuation while blue, teal, green and amber carry interaction/evidence/state/guardrail roles. Medium complexity. Full height: 1,147.9 pt.

### A2 Preferred Light — Color Field

The preferred warm-light structure remains intact. A mist/petrol field, navy action and restrained violet brand accents keep it serious rather than an inverted dark UI. Medium for Home-only, high if promoted to app-wide system appearance. Full height: 1,149.9 pt, +0.2% from A1.

### A3 Cross-Theme Synthesis

A warm-light body uses an edge-to-edge dusk teal/navy trajectory field inspired by Reference 3. Morning Weight and Briefing remain consecutive below it. This satisfies the field-bleed convergence experiment while preserving the compact preferred architecture elsewhere. Medium–High complexity. Full height: 1,161.9 pt, +1.2%.

## Lane B — genuine provocation

All four concepts were reviewed in grayscale against A1 before acceptance. [The structural evidence](../artifacts/home-design-round3-20261003/screens/structural-grayscale-test.png) demonstrates that none retains substantially the same rectangles or scan path.

### B1 Modular Flight Deck

An asymmetric two-column matrix: trajectory occupies a tall left module; confidence/action stack on the right; Goal metrics and phases become paired modules; priorities become a three-tile execution rail. Changes composition, geometry, grouping, density and visual flow. High complexity. Full height: 882.6 pt, −23.1%.

### B2 Editorial Spine

An open warm canvas with a typographic trajectory/confidence masthead, paired actions, one vertical Goal/phase/Guardrail spine and open priority rows. Cards are reserved for interactive elements. Changes surface model, hierarchy, geometry, grouping and flow. High complexity. Full height: 1,061.4 pt, −7.5%.

### B3 Execution Deck

Morning Weight, Briefing and all priorities form the dominant “Now” deck. Trajectory becomes a persistent color ribbon; Goal phases become paired lower lanes. Changes hierarchy/order, grouping, surface use and Goal relationships. High complexity. Full height: 1,032.7 pt, −10.0%.

### B4 Immersive Trajectory Map

Confidence orbit, progress geometry, metrics, phase milestones and Guardrail share one spatial trajectory environment. Morning Weight and Briefing form a transition dock into priorities. Changes composition, geometry, grouping, density and the Goal/Confidence/Phase relationship. Very High complexity. Full height: 975.6 pt, −15.0%.

## Accessibility and implementation boundary

- Every action retains a practical 44 pt or larger target.
- Labels/icons/geometry accompany semantic color.
- Modular, paired and spatial layouts require a documented single-column accessibility-size fallback.
- VoiceOver order must match visual order, especially in B1/B3/B4.
- B4's orbit/path is decorative; semantic milestones remain ordered content. Any future path motion must honor Reduce Motion.
- All directions retain Plus Jakarta Sans and an implementable five-tier core scale, with more assertive display sizing only in experimental mastheads.

## Light-mode feasibility delta

No new code finding changes the Round 2 classification: **partially theme-capable, dark-only today**. Home-only light appearance remains Medium complexity; complete app-wide system appearance remains High complexity. A2 and A3 strengthen the visual case but do not reduce the implementation surface. The root dark override, fixed theme values, global tint, UIKit bridges, charts, Briefing, photo treatment, system controls, widgets, Live Activities and Watch still require coordinated adaptive tokens and QA.

## Shipping isolation

- No shipping Native source or behavior changed.
- No canonical Home projection or semantics changed.
- No global theme/token implementation began.
- No Server behavior changed.
- No build number changed.
- No TestFlight build was created.
- Parallel Build 85 Watch work was not touched.
- The durable backlog now says **Home Round 3 ready for Founder review** without accepting a design.

Stop condition reached: full-resolution Round 3 artifacts are ready for Founder review.
