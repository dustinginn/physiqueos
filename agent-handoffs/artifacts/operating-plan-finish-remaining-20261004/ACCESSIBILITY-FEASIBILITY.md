# Accessibility and Dynamic Type feasibility

- All rendered actions and controls meet the 44 pt minimum target check.
- Status uses text plus indicator, never color alone.
- Selection uses labels plus surface/border state, not color alone.
- Dark and Mineral Light retain high-contrast primary text and distinct secondary text.
- Form sections preserve source order, visible labels and native-control semantics.
- The long Coaching editor remains a vertical scroll surface; Dynamic Type can expand rows without forcing columns of dense controls.
- Exact times, days, dates and state labels remain textual for VoiceOver.
- DEXA reminders remain individually labeled toggles.
- The unavailable DEXA state uses direct explanatory copy and the existing navigation back path.

Implementation should use native SwiftUI controls and locked dynamic tokens. The harness does not require fixed-height production rows or rasterized text.

