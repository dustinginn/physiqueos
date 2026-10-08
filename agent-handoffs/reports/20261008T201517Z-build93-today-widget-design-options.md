# Build 93 — Today widget design options (Founder review; design only)

- Generated (UTC): 2026-10-08T20:15:17Z
- Task: `build93-claude-widget-design-options-20261008`, from prompt `agent-handoffs/inbox/prompts/20261008-build93-claude-widget-design-options.md` (commit `978e0913`).
- Agent: Claude (existing Claude B conversation). The task was queued behind and run after the Recovery correction, which is published (report main `8b8c1f12`). No new session was started.
- Design branch: `claude/build93-widget-design-options-20261008` at `0627ae0a`, on Build 92 `beaf5eff`. **Never merge.**
- **Not done:** production code change, widget CTA or palette change, merge, deploy, build bump, archive, TestFlight or Recovery activation. `latest.json`/`latest.md` are untouched.

## 1. Baseline

The current `systemSmall` square comes from shipping `HomeLoggedTodayWidgetView`:
- header: Today (15 pt), freshness (8 pt), and refresh in a 44 pt-tall row;
- NUTRITION at 16 pt with 8 pt P/C/F;
- ACTIVE at **10 pt**;
- a 30 pt teal-to-navy gradient "Start Logger".

This confirms the Founder's observation: 1,139 cal is prominent, while 649 active cal is small. The baseline is rendered from code (`widget-current-*`); the Founder's screenshot was not needed.

## 2. How the previews were made (authenticity)

- The options are SwiftUI views in the **test target only**: a marked section of `PhysiqueOSTests/HomeWidgetTests.swift`, so there is no project or generator change.
- They reuse the shipping `HomeWidgetPalette`, `HomeWidgetValueFormatter` and deep-link semantics.
- They are rendered by the **same `ImageRenderer` harness** as the shipping widget PNGs, at the real square size: 170 × 170 pt, 3×, 16 pt WidgetKit content margins, and the widget container colour for each theme.
- The run is opt-in (`WIDGET_DESIGN_DIR`); without it the test skips.
- **These are faithful widget-sized renders, not WidgetKit Home Screen screenshots.** Shipping-widget tests still pass: 25/25 in the `HomeWidgetTests` + options run.

**Fixture.**
- Nutrition 1,139 cal, Active 649 cal and "12m" are the Founder's reported values.
- **The P/C/F macros (96 / 104 / 38) are illustrative.**
- The `*-with-weight` renders add a today weight of 176.1 lb, kept in its canonical display string.

## 3. Options (folder `agent-handoffs/artifacts/build93-widget-design-options` on the design branch)

| | Dark | Mineral Light | Layout |
|---|---|---|---|
| A — Balanced stack | `widget-option-a-dark.png` | `widget-option-a-mineral-light.png` | Current stack. **Active raised from 10 pt to 19 pt, equal to Nutrition**. Macros 9 pt with separators. Weight trails the ACTIVE label |
| B — Two columns | `widget-option-b-dark.png` | `widget-option-b-mineral-light.png` | NUTRITION and ACTIVE side by side, **both 17 pt** with a hairline divider. **P/C/F become three 12 pt chips with gram units**. Weight is a quiet label line |
| C — Refined ledger | `widget-option-c-dark.png` | `widget-option-c-mineral-light.png` | Labels left, figures right-aligned. Nutrition 17 pt with macros beneath. **Active 24 pt, the largest figure**. Weight sits under the ACTIVE label |

Also on the branch:
- `widget-current-*` (baseline);
- `*-with-weight-*` (6 renders, Dark and Mineral Light);
- `board.html`, a side-by-side board, and `README.md`.

**Common to all three options**
- Today header, freshness ("12m"), refresh, Nutrition calories + P/C/F, Active calories, and Start Logger with its unchanged deep link. Resume Workout behaviour is unchanged.
- The Start Logger CTA uses the approved **iPhone Finish Workout amber**:
  - Dark `#EFB84F`, Mineral Light `#C88228`;
  - label `#10202A`, contrast at least 4.5:1 in both themes, as tested in the theme lane;
  - it replaces the teal/blue gradient.
- Teal status and refresh indicators are not recoloured.
- The 44 pt refresh hit target is kept. Negative padding stops it consuming header height, which is what frees room for larger figures.

**Fit**
- Every option fits the 170 pt square, with and without weight, at the default text size.
- Fixed point sizes match the shipping widget's convention, with `minimumScaleFactor` as the overflow guard.
- B's 17 pt columns fit four-digit values with grouping (for example 2,463), which is the shipping sample's maximum.

## 4. Recommendation

**B (Two columns).**
- It gives eaten and burned genuinely equal weight as a pair.
- It makes the macros the most legible of any option.
- It keeps room for weight and the CTA.

**A** is the lowest-risk fallback. **C** suits only if Active should lead, since it inverts the current hierarchy.

## 5. Founder decisions

1. Select A, B or C.
2. Should the refresh glyph move to the amber action colour, or stay teal (current)? The shipping palette currently ties refresh and CTA to one action semantic.

## 6. Next step after selection

A separate implementation task:
- port the chosen layout and the amber CTA token into `HomeLoggedTodayWidgetView` / `HomeWidgetPalette`;
- regenerate the `home-screen-widget-v1` renders;
- add size and contrast tests and run the Release gates;
- accept on a real Home Screen.

It should integrate with the Watch/Live Activity theme candidate `741d3562` so all four surfaces share the token.

## 7. Disk and coordination

- Ran only after the Recovery correction finished, using the same lane simulator; no concurrent heavy Xcode job.
- About 15 GiB free, above the 12 GiB floor.
- Tracked shipping widget PNGs rewritten by `HomeWidgetTests` were restored.
- The lane simulator and DerivedData are removed after this report.
