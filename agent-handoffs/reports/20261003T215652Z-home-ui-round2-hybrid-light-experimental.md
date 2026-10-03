# Home UI Exploration Round 2 — hybrid, light and experimental

Date: 2026-10-03  
Status: **Ready for Founder review; no direction accepted or ranked**  
Artifact commit: `a3e7826b49a01baa0aae564300525bf3b7d6ceeb`

## Authority

- Round 2 prompt authority: `031df6f138c2f2332d63879302a1573e19f5d225`
- Current Native Build 84 source authority: `bcd92c74602695766c270fe6af052de45afece4b`
- Exact Founder Round 1 visual anchors: [light/card](../artifacts/home-design-round2-20261003/screens/anchor-a-light.jpg) and [dark/open](../artifacts/home-design-round2-20261003/screens/anchor-b-dark.jpg)
- Production-derived immutable content fixture: [FIXTURE.json](../artifacts/home-design-round2-20261003/FIXTURE.json)
- Content-parity evidence: [CONTENT-PARITY.md](../artifacts/home-design-round2-20261003/CONTENT-PARITY.md)

The actual Build 84 Home composition, read model, shared theme, typography, reusable components, navigation and confidence semantics were inspected before rendering. The Native confidence authority is `79% confidence`; the attached anchors' `MODERATE` caption is not propagated.

## Founder review artifacts

- [Review index](../artifacts/home-design-round2-20261003/README.md)
- [Complete interactive comparison board](../artifacts/home-design-round2-20261003/comparison-board.html)
- [Full code/light-appearance audit](../artifacts/home-design-round2-20261003/AUDIT.md)
- [Board overview PNG](../artifacts/home-design-round2-20261003/screens/comparison-board-overview.png)
- [Hybrid light/dark side-by-side](../artifacts/home-design-round2-20261003/screens/hybrid-light-dark-side-by-side.png)

Every direction has a full-page render and a 402 × 874 pt above-the-fold render. The review index links each image directly.

## Immutable Home information

All seven code-rendered screens use one fixture containing the current Founder greeting, trajectory, goal phase, confidence, target/remaining values, next action, Latest Briefing type/title/date/prompt, complete primary Goal metrics/phases/guardrail, all three priorities and all five navigation destinations.

The renderer validates 52 required semantic fields per concept. Result: **52/52 fields present and exact, zero mismatches in every concept**. Round 2 places the briefing prompt behind a clear action while preserving it in the fixture; this is progressive disclosure only.

## Directions

### Hybrid Dark

Synthesizes the light anchor's contained hero/priority controls with the dark anchor's compact, ruled Goal hierarchy. Dark navy and sparing purple preserve the recognizable identity; blue, teal, green and amber separate action, evidence, active and guardrail roles. Medium estimated implementation complexity. Measured at 123 pt / 9.6% less vertical height than the current reference.

### Hybrid Light

The same synthesis in a warm-neutral true-light appearance, with navy ink/action, white surfaces, a pale blue-green hero and restrained purple branding. Medium for Home-only; high if adopted as full-app system appearance. Measured at 120 pt / 9.3% less height.

### Hybrid Compact

Reduces header, confidence, action, Briefing and phase-row footprint while retaining all canonical data and practical controls. Priorities become visible much earlier. Medium estimated complexity. Measured at 343 pt / 26.7% less height; accessibility categories require automatic stacked expansion.

### Experimental A — Trajectory Ribbon

Challenges the heavy-card system with an edge-to-edge trajectory field and open editorial Goal/priorities. Amber carries the immediate action, teal carries evidence/status context, and purple remains brand. High estimated complexity. Measured at 33 pt / 2.6% less height because recovered card space is intentionally reinvested in section rhythm.

### Experimental B — Mineral Mosaic

Uses a mineral blue-green canvas, deep teal trajectory field, oxide action, asymmetric corners and phase rails. This materially changes the background/surface/color relationship while preserving structure and content. High estimated complexity. Measured at 109 pt / 8.5% less height.

### Experimental C — Split Command

Changes hierarchy/order: a split status/confidence field and next action lead into priorities; Briefing and the complete Goal narrative follow. This is deliberately experimental IA, not an accepted semantic or production-order change. High estimated complexity. Measured at 124 pt / 9.7% less height.

## True iOS light appearance finding

Build 84 is **partially theme-capable, but dark-only today**. Home mostly consumes shared tokens, yet `PhysiqueOSApp` forces `.preferredColorScheme(.dark)`, `PhysiqueOSTheme` contains fixed dark RGB values, Root tabs use one global purple tint, the asset catalog has no semantic color sets, and UIKit bridges resolve those fixed tokens directly.

A Home-only light implementation is feasible at medium complexity through an adaptive semantic palette plus system-control QA. A real app-wide light mode is high complexity: root/system chrome, UIKit bridges, charts, Briefing gradients/dividers, photo treatment, sheets/alerts/keyboards/pickers, widgets, Live Activities and Watch all need appearance-specific validation. Simply removing the dark override would produce mixed chrome and is not a viable implementation.

Recommended token separation is documented in the audit: neutral foundation/content; purple brand; navy/blue interaction/selection; teal evidence/information; green success/active; amber warning/guardrail/completion; red destructive; stable chart-specific identities.

## Boundary confirmation

- No shipping Native source or behavior changed.
- No production content projection or semantics changed.
- No Server behavior changed.
- No TestFlight build was created.
- No rebrand or visual direction was accepted.
- The durable backlog now says **Home Round 2 exploration ready for Founder review** and leaves the decision gate open.

Stop condition reached: mockups and comparison artifacts are ready for Founder review.
