# Accessibility feasibility

- Primary actions are 52 pt high; secondary/dose/evidence controls are at least 44 pt.
- Status always combines a word with a dot/shape; color is supplementary.
- Dose is read as a label, numeric value and unit. The helper sentence makes planned-versus-actual semantics explicit.
- Time and cadence stay in text and retain exact Server formatting.
- Completed, skipped and paused use explicit labels and distinct terminal copy.
- Destructive Mark Skipped remains subordinate and requires the existing confirmation dialog.
- Section rows are unbounded in height. Preparation and execution notes wrap without truncation.
- Dynamic Type implementation should preserve the same single-column order, let summary facts collapse to one column at accessibility sizes and keep the primary action visible after the content.
- VoiceOver should announce title, status, schedule, dose and action in that order; “Took a different amount?” must expose Amount taken plus unit.
- The evidence-driven banner explicitly says there is no separate manual completion, preventing a color-only distinction from manual priorities.

The translation is feasible with current SwiftUI primitives. It does not require screenshot-specific fixed text frames.
