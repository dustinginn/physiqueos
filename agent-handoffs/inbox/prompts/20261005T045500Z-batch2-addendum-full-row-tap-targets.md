PhysiqueOS Batch 2 addendum — full-row tap targets on accepted You/Settings surfaces

TASK TYPE

ADDENDUM to the existing Claude Batch 2 implementation task.
Same Claude chat.
Do not interrupt the current visual checkpoint unless necessary.
Carry this bounded accepted-Batch-1 interaction correction into the eventual Batch 2 integration candidate.

FOUNDER PHYSICAL-DEVICE FINDING

On Build 87, several visually full-width navigation rows only respond when tapping the left/label portion.

Confirmed affected examples:
- You → Goals
- You → Operating Plan
- You → Settings
- Settings → Appearance

The full visible row/card should be tappable, including the whitespace and trailing-chevron side.

This is an interaction-parity defect, not a visual redesign.

REQUIRED FIX

Audit the accepted You/Settings navigation rows for this pattern, not just the four examples.

For every row that visually presents as one navigation control:
- make the entire visible row/card hit region interactive;
- preserve the exact accepted visual geometry;
- preserve the existing destination and navigation behavior;
- do not create nested competing tap targets;
- maintain >=44 pt accessibility target;
- preserve VoiceOver label/traits;
- use an appropriate SwiftUI contentShape/button/navigation-link structure rather than invisible overlay hacks where possible.

Scope the audit to the accepted Batch 1 You/Settings family so the same defect is not left on another sibling row.

Do not reopen visual design.
Do not alter Goals content, Operating Plan content, Settings content, Appearance semantics or Founder connection behavior.

TESTS

Add deterministic UI/interaction coverage proving taps near:
- left content;
- center whitespace;
- trailing-chevron/right edge

all activate the same destination for representative You and Settings rows.

Test Dark and Mineral only as needed to prove hit behavior is appearance-independent.

INTEGRATION

Codex A Home correction authority is separately accepted at:
49e48f1eab3bc6ff22ca6c4bc24b3a9955b0fcc7

This full-row tap fix should ride with the eventual Batch 2 integration candidate alongside that accepted Home correction.

Do not create a standalone TestFlight build for this issue.

PIXEL SAFETY

Before final Batch 2 integration, capture You and Settings after the hit-target fix and compare against the already accepted Build 87 appearance.

There should be no intentional pixel change.

If fixing the hit target changes row geometry, spacing or rendering, correct it before final integration.

CURRENT BATCH 2 CHECKPOINT RULE

Continue obeying the governing Batch 2 checkpoint protocol.
Do not use this addendum as permission to skip or combine Founder Log/Logger visual checkpoints.

WORKTREE

Stay in the existing single RC-provided worktree.
No EnterWorktree.
No secondary worktree.

END ADDENDUM.