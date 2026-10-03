# PhysiqueOS Home UI/design exploration — Founder review

Status: **Ready for Founder visual review; no direction selected**
Date: 2026-10-03
Review-set commit: `f2752b192314bedf3f5dd9662233112598216467`

## Outcome

A design-only Home exploration is complete with a Build 84 baseline and six unranked directions:

1. Current Build 84
2. Refined Current
3. Restrained Purple
4. Compact / Information Efficient
5. Modern Evolution
6. Outside A — Editorial Timeline
7. Outside B — Clinical Daylight

Each direction has a full-page render, an exact 402 × 874 point above-the-fold export, palette values, type scale, spacing/card/radius rules, change/preservation notes, implementation complexity, reusable components/tokens, accessibility/Dynamic Type concerns and measured vertical impact.

No shipping Native behavior was changed. No Server behavior was changed. No TestFlight build was created. This is not a rebrand, and no direction is accepted or ranked.

## Current Home implementation authority

- Build 84 source authority: `bcd92c74602695766c270fe6af052de45afece4b`
- Inspected Home composition: `ios/PhysiqueOS/Presentation/Home/HomeView.swift`
- Inspected Home components: `HomeHeaderView`, `HomeHeroCardView`, `NextBestActionView`, `BriefingCardView`, `GoalRowView`, `TodaysFocusCardView`, `FocusTileView`
- Inspected shared authority: `PhysiqueOSTheme`, `Typography`, `CardContainer`, `SectionHeading`, `IconBadge`, `StatusChip`, `MetricRow`, `ConfidenceRing`
- Inspected contract/navigation authority: `HomeReadModel`, `RootTabView`
- Production Server authority was not modified; the last reported current production SHA remains `b47663b32372a78010dbc8e4aa41303012d98dc7b`.

The unchanged Build 84 app was compiled and launched on an iPhone 17 Pro simulator (402 × 874 points, 3×). Its disconnected sandbox fixture displayed older placeholder content and is retained only as a Native geometry/rendering source check. The comparison baseline recreates Build 84’s actual hierarchy with current production-shaped Founder facts: Build Lean Mass, Lean Mass Build, 79% Moderate confidence, +5.8 of +10 lb lean mass, Oct 31 target, 8.1% within the 8–9% guardrail, Sep 23 Midweek Briefing and real current priority naming/schedule patterns.

## Durable review locations

- Review index: [`agent-handoffs/artifacts/home-design-exploration-20261003/README.md`](../artifacts/home-design-exploration-20261003/README.md)
- Interactive comparison board: [`agent-handoffs/artifacts/home-design-exploration-20261003/comparison-board.html`](../artifacts/home-design-exploration-20261003/comparison-board.html)
- Full code/design audit: [`agent-handoffs/artifacts/home-design-exploration-20261003/AUDIT.md`](../artifacts/home-design-exploration-20261003/AUDIT.md)
- Rendered screens: [`agent-handoffs/artifacts/home-design-exploration-20261003/screens/`](../artifacts/home-design-exploration-20261003/screens/)
- Comparison overview PNG: [`comparison-board-overview.png`](../artifacts/home-design-exploration-20261003/screens/comparison-board-overview.png)
- Unchanged Build 84 simulator source check: [`build84-native-render-source-check.png`](../artifacts/home-design-exploration-20261003/screens/build84-native-render-source-check.png)
- Backlog state: [`agent-handoffs/backlog/20261003-app-wide-ui-design-polish-home-exploration.md`](../backlog/20261003-app-wide-ui-design-polish-home-exploration.md)

## Current design audit, concise

- **Typography:** Home spans roughly 7–34 pt across 16 size stops and five weights. Plus Jakarta Sans tokens coexist with raw San Francisco `.system` calls. The 7–10.5 pt essential-adjacent labels and fixed-size phase/ring styles are the main Dynamic Type/legibility debt.
- **Spacing:** Screen, card and component spacing mix 2/6/8/10/12/14/15/16 values. Similar relationships are locally encoded rather than expressed by a small semantic rhythm.
- **Cards/radii:** General cards use 14 pt, phase and guardrail cards 16 pt, session priorities 18 pt and badges 10 pt. The nested Goal card → phase cards → guardrail structure is the largest avoidable source of vertical consumption.
- **Purple:** `#8B8CFF` currently carries brand, interaction, selected navigation, status/progress and decorative tint roles. Green `#4ADE80`, blue `#60A5FA`, amber `#FBBF24`, cyan/teal and red semantics already exist and can take clearer functional roles without arbitrary recoloring.
- **Alignment:** Hero, Goal phase and priority geometry use different icon columns/baselines; cross-section edges do not always reinforce one consistent grid.
- **Touch/accessibility:** Priority completion’s visible control is approximately 22–24 pt and should explicitly guarantee a 44 pt effective target. Color states already have text/icon companions and should keep them.
- **Reuse:** Existing models and components are sufficient for all conservative directions. Compact and Editorial require layout variants, not new domain data or Server work.

## Direction notes and feasibility

### Current Build 84

True source-structure baseline with current Founder-shaped content. Full measured harness height: 1,345 pt. Its purpose is comparison, not recommendation.

### Refined Current

Preserves navy, purple identity, cards, section order and all information. Tightens the stack and nested padding, reduces radius variance and consolidates type weights. Measured height: 1,262 pt, gaining 83 pt / 6%. Estimated implementation: low; current components and tokens can be normalized in place.

### Restrained Purple

Preserves dark navy and product structure while making purple a brand signature. Blue owns primary interaction/selected navigation, teal owns evidence/trajectory context, green owns positive state and amber owns guardrail/completed-phase emphasis. Measured height: unchanged at 1,345 pt. Estimated implementation: medium because semantic-token use must be audited across states.

### Compact / Information Efficient

Uses a one-line greeting, 62 pt confidence module, 48 pt action, compact briefing disclosure and timeline Goal rows rather than nested phase cards. All Goal phases, progress, guardrail, briefing and three priorities remain. Measured height: 1,009 pt, gaining 336 pt / 25%; Goal/priority content materially advances above the fold. Estimated implementation: medium, with accessibility-size fallback layouts required.

### Modern Evolution

Adds a tonal hero atmosphere, quieter elevation, cyan interaction/evidence and semantic phase rails while preserving the current card architecture and information order. Measured height: 1,346 pt, effectively unchanged. Estimated implementation: medium; mostly new styling modifiers and token application.

### Outside A — Editorial Timeline

Challenges the heavy-card model. Trajectory, briefing, Goal and priorities become typographic sections with rules; one strong action surface remains. All information stays present. Measured height: 1,283 pt, gaining 62 pt / 5% while spending some recovered card padding on editorial breathing room. Estimated implementation: high; needs new section/timeline components and thorough accessibility grouping.

### Outside B — Clinical Daylight

Explores a warm light canvas, white information surfaces, navy interaction, teal evidence, green success and ochre guardrail semantics, with purple as a compact brand cue. Structure and content remain unchanged. Measured height: unchanged at 1,345 pt. Estimated implementation: high because a full light semantic palette and appearance QA would be required.

## Palette and typography proposal

The current palette and every actual Home text role are inventoried in the audit. Across the proposed directions, Plus Jakarta Sans remains the family. A coherent implementation target is:

- 11 pt for eyebrow/status/metadata label;
- 13 pt for supporting metadata/caption;
- 15 pt for body and actionable rows;
- 18 pt for card/hero title;
- 28–32 pt for the Founder-name display;
- ordinary weights limited to approximately 500 / 650 / 750.

The semantic color proposal reserves purple for brand emphasis; blue for interaction/navigation; teal/cyan for evidence/information; green for on-track/active; amber for guardrail, caution or phase-complete context; red for destructive/error; and neutral navy/ink for hierarchy. This is an exploration model, not a migration decision.

## Validation performed

- Unchanged Build 84 Debug simulator build succeeded for iPhone 17 Pro with `CODE_SIGNING_ALLOWED=NO`.
- Unchanged Build 84 app installed/launched and Home was captured at 1206 × 2622 px.
- Seven full-page renders generated from a disposable component-faithful harness.
- Seven above-the-fold renders verified at exactly 1206 × 2622 px (402 × 874 pt at 3×).
- Full render heights measured from the DOM and reflected in the comparison notes.
- Comparison board visually inspected across the conservative, compact, modern, editorial and daylight families.
- Inline review carousel rendered and visually checked.
- `git diff --check` passed before publication commit.

Build warnings were limited to pre-existing main-actor diagnostics in `BackgroundExecutionAssertion.swift`; no exploration code was added to the Xcode target.

## Mutations and explicit non-mutations

Changed only:

- durable design artifacts under `agent-handoffs/artifacts/home-design-exploration-20261003/`;
- this report;
- a durable backlog note marking Home exploration as in Founder review.

Did not change:

- any file under `ios/`;
- any Server or web runtime source;
- Home behavior, API contracts, writes, navigation or production authority;
- TestFlight/App Store Connect state;
- branding or accepted design direction.

## Blockers and next step

No implementation blocker exists. The deliberate gate is Founder visual review. The next action is to inspect the seven unranked directions and identify elements to pursue, combine or discard. Do not implement a direction until that decision is explicit.
