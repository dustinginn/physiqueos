# Selected Home refinement + Log UI exploration report

Date: 2026-10-04 UTC  
Assignment authority: `9d9a6b7d0b254c91aa8da93fd5f9ced3b17a9011`  
Shipping Native authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)  
Artifact commit: `ec425a96b2f4b726fd75ed8e3b45a8159c6e4ae8`

## Result

The Founder-selected immersive dark/mineral-light Home pair was corrected first and frozen as this round’s visual-system authority. The real Build 85 Native Log implementation and production projection were then audited, and three materially different Log architectures were rendered in both dark and mineral-light appearance.

No option is ranked or accepted.

## Review artifacts

- Index: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/README.md`
- Interactive comparison: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/comparison-board.html`
- Corrected Home pair: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/screens/corrected-home-pair.png`
- Dark Log comparison: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/screens/log-dark-three-way.png`
- Mineral-light Log comparison: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/screens/log-light-three-way.png`
- All six Log screens: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/screens/log-all-approaches-grid.png`
- Current Build 85 Log reconstruction: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/screens/baseline-full.png`
- Native/source audit: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/SOURCE-AUDIT.md`
- Content-parity record: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/CONTENT-PARITY.md`
- Frozen visual grammar: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/SELECTED-VISUAL-GRAMMAR.md`
- Implementation/accessibility notes: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/IMPLEMENTATION-NOTES.md`
- Machine result: `agent-handoffs/artifacts/selected-home-log-exploration-20261004/validation.json`

Every individual screen also has a full-page 3× PNG and a matching 402 × 874 pt above-the-fold crop in the artifact `screens/` directory.

## Selected Home corrections applied

- Removed the visible `BUILD LEAN MASS` trajectory sublabel while retaining the canonical semantic field.
- Changed the visible goal label to `PRIMARY GOAL` only while retaining the canonical goal title.
- Moved the dark Primary Goal label to deeper `#5C3FD2` on `#EAE4FF`, measured at 5.5:1 contrast.
- Strengthened all four metric dividers, labels and values.
- Changed the visible target label to `TARGET DATE`; value remains `Oct 31`.
- Kept the large atmospheric ring at exact 79% geometry but reduced its visual opacity to 28% dark / 24% light.
- Preserved the foreground 79% Confidence ring, report glyph, persistent Guardrail, Phase 2 progress ownership, actions, priorities and exact tab structure.

## Actual Log authority

The current hierarchy comes from `LogView.swift`: header, Logged Today, conditional pending review, conditional processing, Training Logger and Upload. Production data comes from `ProductionLogAPI` / `LogReadModel`; the source-derived fixture combines the canonical `evidence-review-queue` and matching `weight.current` Build 85 tests.

The current app forces dark appearance. True mineral light is feasible, but requires app/shared-UI appearance tokens plus component-state validation rather than local screen recoloring.

## Log directions

### Direct Translation

Preserves current source order and applies the selected visual grammar with tighter containment and clearer action hierarchy.

- dark + mineral light
- 1048 pt full height
- 171 pt less than the reconstructed current Log
- medium implementation complexity

### Compact Command Center

Leads with Training Logger, turns four current-day domains into a compact status grid, and groups weight/evidence as quick actions.

- dark + mineral light
- 874 pt full height: one target viewport in the rendered loaded state
- 345 pt less than current
- high implementation complexity

### Editorial / Open Log

Replaces the heavy card stack with an open ruled ledger, one prominent Training action field and open review/intake rows.

- dark + mineral light
- 1019 pt full height
- 200 pt less than current
- high implementation complexity

## Parity and accessibility validation

- Corrected Home dark: 52 / 52 semantic fields, zero differences.
- Corrected Home mineral light: 52 / 52 semantic fields, zero differences.
- Current Log baseline and all six Log explorations: 69 / 69 audited production fields each, zero differences.
- Both Home rings validate at exact 79 geometry.
- All screens use the actual 402 × 874 pt target at 3× export.
- Essential text is at least 11 pt; principal interactions remain at least 44 pt.
- Semantic color always has a text, icon or geometric cue.
- Dynamic Type implementation notes explicitly require grids to linearize and do not treat one-screen density as an accessibility-size constraint.
- Loading, error, empty, processing, pending-review, duplicate, photo-loading and draft-continuation feasibility is documented.

## Backlog and scope

The durable app-wide UI/design polish backlog now records:

- selected Home under refinement;
- Log exploration ready for Founder review;
- Weekly Briefing deferred and not started;
- no direction or migration accepted.

No shipping Native source, production content projection, Server behavior, build configuration or TestFlight state changed. No Weekly Briefing design was created.
