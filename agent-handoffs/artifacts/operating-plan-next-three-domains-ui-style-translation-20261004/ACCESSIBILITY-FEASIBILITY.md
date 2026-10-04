# Accessibility feasibility

- The review harness uses the real 402 pt iPhone target width and at least the 874 pt screen height.
- All buttons and editor choices are at least 44 pt high. Lifecycle state is conveyed by text (`Active`, `Paused`, `Pause`, `Restore`), never color alone.
- Dark and mineral-light palettes preserve high-contrast primary text and differentiated secondary text. Destructive actions retain explicit labels.
- The information hierarchy uses native-feasible SwiftUI stacks, grids, controls and sheets. Nothing depends on rasterized text or screenshot-only overlap.
- Dynamic Type feasibility: values can wrap, sheets scroll, method cards expand vertically and no fixed-height text container is required. The mockups show the default content-size category; shipping implementation should retain scrolling and avoid truncating purposes/notes at accessibility sizes.
- Editor grouping preserves labels directly adjacent to controls, with explicit schedule previews and status wording for VoiceOver.
