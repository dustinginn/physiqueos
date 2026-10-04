# Accessibility feasibility

- Every domain row, back control and visible edit action has a 44 pt or larger hit region.
- Active is communicated by text plus a dot, never color alone.
- Units stay explicit (`kcal/day`, `g per lb`, `area sessions`).
- Dark and mineral-light palettes use high-contrast text and restrained semantic accents.
- The proposed hierarchy maps to existing Dynamic Type styles. At accessibility sizes, the three-column metadata band should become a vertical list and the field label/value rows should use the existing `OperatingPlanFieldRow` vertical fallback.
- VoiceOver should combine domain, title, detail and status for each root row; announce destination role for tappable rows; and combine every field label with its value.
- The metric tiles are presentation grouping, not a replacement for accessible label/value order.
- Long purpose copy and strategy values wrap naturally. No content is hidden behind fixed-height cards.
