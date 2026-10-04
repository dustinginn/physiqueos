# Widget accessibility and system-fit review

- Contrast is strong in both standard appearances. Mineral Light uses a mineral field rather than white; dark uses the locked navy canvas.
- Purple never communicates state. Stale/offline keeps explicit warning copy; waiting/unavailable use distinct sentences; missing Weight uses an em dash plus text.
- The target preserves WidgetKit-safe truncation: maximum two Training lines, single-line metrics and bounded workout progress.
- Large domain rows are 58 pt and the primary action is 49 pt. The small family has one whole-widget Start/Resume deep link. The separate refresh control requires an effective 44 pt region; current Build 85 uses 24/28 pt frames, so this is recorded in the implementation-delta ledger.
- Privacy redaction is rendered in both sizes and appearances. It does not remove the visible widget title or safe action label.
- The design remains feasible with WidgetKit container margins and semantic container background ownership.
- Dynamic Type feasibility depends on widget-specific bounded scaling/truncation rather than allowing unbounded reflow to destroy the family. VoiceOver must combine each large row's label/value and announce refresh and Start/Resume explicitly.
- System accent/tinted appearance must retain non-color dividers, labels and state text. No semantic status is color-only.
