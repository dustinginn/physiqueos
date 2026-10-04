# Accessibility and Native feasibility

- All interactive targets render at 44 pt or larger.
- Form labels remain visible; placeholder text is not the only label.
- Disposition state uses text, border and selected fill rather than color alone.
- Validation, processing and success states use explicit copy plus semantic accent.
- Briefing rows combine cadence/type, title and date; disclosure is not the only navigation signal.
- Confidence factor groups use text headings and symbols; color is supplementary.
- Dark and Mineral-Light palettes maintain strong primary/secondary contrast on their actual surfaces.
- Geometry uses ordinary SwiftUI-feasible stacks, grids, form controls, sheet detents and scroll views.
- Long Confidence content scrolls; no screenshot-only compression is required.
- Type hierarchy is limited to a coherent eyebrow/body/section/title scale and can reflow under Dynamic Type. Long labels are allowed to wrap rather than shrink.
- Bottom bars and sheet dismissal remain system-feasible. No hover-only or precision-pointer behavior is required.
