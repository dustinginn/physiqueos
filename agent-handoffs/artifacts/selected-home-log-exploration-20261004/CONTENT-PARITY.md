# Content-parity record

The renderer compares every `data-semantic` value in every rendered phone against its immutable fixture and fails on a missing, extra or mismatched field.

## Corrected Home

Both Home appearances pass **52 / 52** canonical fields with zero missing, extra or mismatched values.

The requested presentation corrections are explicit and do not change projection semantics:

- `hero.goalLabel = Build Lean Mass` remains in the fixture but is visually hidden below `TRAJECTORY`.
- `goal.title = Build Lean Mass` remains in the fixture but is visually hidden beside the visible `PRIMARY GOAL` label.
- the canonical target semantic remains `Target`; the visible presentation label is `TARGET DATE`.
- the foreground confidence ring and atmospheric background ring both carry exact geometry value `79`.
- the briefing preview remains canonical but is progressively disclosed beyond Home.

All exact goal, phase, progress, guardrail, priority, action and navigation content is retained.

## Log

The Build 85 baseline and all six proposed Log screens pass **69 / 69** audited production fields with zero missing, extra or mismatched values.

The comparison includes:

- loaded state and local date;
- all header strings;
- all four Logged Today rows, including kind, label, SF Symbol authority, summary, context, processing state and destination;
- pending-review section and item fields, duplicate state, action and destination;
- processing count;
- Training Logger content and destination;
- dated-weight action and destination;
- Upload content, both actions, source choices, draft/loading copy and destination;
- all loading/error/processing/empty/duplicate labels;
- all five tabs in their source order.

`validation.json` is the machine-readable result. The rendered designs change only grouping, ordering emphasis, surfaces and presentation—not production semantics or destinations.
