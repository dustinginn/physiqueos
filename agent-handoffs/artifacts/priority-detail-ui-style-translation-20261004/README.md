# Priority Detail family · locked-system translation

Status: **ready for Founder review; Priority Detail is not locked**.

This package translates the complete current Priority Detail family into the locked PhysiqueOS dark/mineral visual system. It is one direction, not an exploration set. The canonical information and action contract remains unchanged.

## Fast review

- `screens/priority-family-board-dark.png`
- `screens/priority-family-board-light.png`
- `screens/morning-weigh-in-dark-light.png`
- `screens/foam-rolling-dark-light.png`
- `screens/tesamorelin-dose-aware-dark-light.png`
- `screens/retatrutide-paused-dark-light.png`
- `screens/fadogia-dark-light.png`
- `screens/evidence-priorities.png`
- `screens/terminal-states.png`
- `comparison-board.html`

## Proof

- `SOURCE-AUDIT.md`
- `COVERAGE-MATRIX.md`
- `ROUTING-COMPLETION-AUDIT.md`
- `ACCESSIBILITY-FEASIBILITY.md`
- `IMPLEMENTATION-FEASIBILITY.md`
- `PARITY-PROOF.md`
- `validation.json`

## Product decisions preserved

- No Related Goals cards.
- No informational Completion cards.
- No sandbox fallback in the design contract.
- Mark Complete remains prominent and occurrence-bound.
- Peptide completion preserves the planned dose and supports recording a different amount without changing the plan.
- Morning Weigh-In and evidence priorities remain evidence-driven.
- No undo/reopen is invented.
- Goals is recorded as locked; static Completed-Goal photos are accepted and are not an implementation gap.

No shipping Native code, Server behavior, production projection, completion state, notification, build or TestFlight state changed.
