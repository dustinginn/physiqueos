# Build 93 — Today widget (systemSmall) design options for Founder review

**This is design only.** No shipping widget code, CTA or palette changed.
- The options live as test-target SwiftUI on branch `claude/build93-widget-design-options-20261008`, based on Build 92 `beaf5eff`.
- They are rendered by the same `ImageRenderer` harness that produces the shipping widget PNGs: 170 × 170 pt square at 3×, 16 pt WidgetKit content margins, and the widget's own container colour per theme.
- **These are not WidgetKit Home Screen screenshots.** `widget-current-*` is the shipping `HomeLoggedTodayWidgetView` rendered by the same harness, for comparison.

**Fixture.**
- Nutrition 1,139 cal, Active 649 cal and "12m" freshness come from the Founder's report.
- **The P/C/F macros (96 / 104 / 38) are illustrative.**
- `*-with-weight` adds a today weight (176.1 lb) to show how each option fits it.

**Common to all three options**
- Same Today header, "12m" freshness and refresh, and the same content and deep links as shipping.
- The Start Logger CTA uses the approved iPhone Finish Workout amber:
  - Dark `#EFB84F`, Mineral Light `#C88228`;
  - label `#10202A` (contrast ≥ 4.5:1 in both themes);
  - this replaces the teal-to-navy gradient.
- The refresh glyph keeps the existing teal action accent; teal status indicators are not recoloured.
- The 44 pt refresh hit target is kept. Negative padding stops it taking header height.

| Option | Files | Idea |
|---|---|---|
| **A — Balanced stack** | `widget-option-a-{dark,mineral-light}.png` | The current structure, but Active is set at the same 19 pt as Nutrition. Smallest change. |
| **B — Two columns** | `widget-option-b-{dark,mineral-light}.png` | Nutrition and Active side by side at equal 17 pt. P/C/F become three legible 12 pt chips. Weight, when present, is a quiet line. |
| **C — Refined ledger** | `widget-option-c-{dark,mineral-light}.png` | Labels left, figures right-aligned. Active is the largest figure (24 pt) and Nutrition is 17 pt with macros under it. Strongest typographic rhythm. |

## Recommendation: B

- **B** best answers the request. Eaten and burned read as an equal pair, the macros become the most legible of any option, and it keeps clear room for weight and the CTA.
- **A** is the conservative fallback: least visual change, though macros stay small.
- **C** is the right pick only if Active should lead. It deliberately inverts the current hierarchy.

## Decisions for the Founder

1. Choose A, B or C.
2. Should the refresh glyph join the amber action colour, or stay teal (current)?

After selection, the implementation will port the chosen layout into `HomeLoggedTodayWidgetView` and the palette CTA token, with WidgetKit size and contrast tests and real Home Screen acceptance. That is a separate, authorized task.
