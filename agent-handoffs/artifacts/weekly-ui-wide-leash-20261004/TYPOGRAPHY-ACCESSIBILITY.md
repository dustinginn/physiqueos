# Typography and accessibility

## Shared type system

The harness uses Plus Jakarta Sans, matching the locked Home exploration. No font-family change is proposed.

| Role | Range across A/B/C |
|---|---:|
| Immersive data/hero numeral | 44–62 pt |
| Hero / major evidence statement | 25–40 pt |
| Domain heading | 17–24 pt |
| Primary narrative/body | 15 pt |
| Metric / secondary value | 12–18 pt |
| Eyebrow / axis / supporting label | 10–12 pt |

Weight variation is limited to regular, semibold and bold roles. Dense Analytical reduces whitespace and heading size, not body copy.

## Accessibility feasibility

- Dark text/background contrast is strong across the navy, teal, amber and cyan palette.
- Color is always paired with labels, position and geometry; Training/priority state is never color-only.
- Energy charts retain direct day labels, legend names and an accessible summary.
- VoiceOver reading order remains the canonical DOM order: navigation, Lead/Confidence, Energy, Weight, Photos, Training, future Recovery, Coach's Take, revision.
- Every quantitative graphic can expose its exact source label/value through Swift Charts accessibility representations or combined accessibility elements.
- The 68% ring has a textual score, band, movement, delta and reason.
- Priority Muscle Groups are left-aligned, full-width or two-column scan-aligned, with no centered/narrow composition.
- The fixture-only Recovery boundary is readable text, not styling alone.
- Atmospheric geometry is static and decorative. Reduce Motion needs no alternate semantic presentation.

## Dynamic Type

- A can collapse the three-column Priority rows into label/value/rail vertical rows.
- B can turn the two-column Priority matrix into one column and let section color fields grow naturally.
- C can collapse Training highlight columns into stacked label/value/delta rows.
- Energy can switch to one accessible daily row per date at accessibility categories while preserving all 14 values.
- No concept depends on clipped overlays or fixed viewport height.

All shown controls retain roughly 44 pt height. The artifacts are static visual review surfaces; any shipping implementation must use semantic Buttons and the existing navigation behavior.
