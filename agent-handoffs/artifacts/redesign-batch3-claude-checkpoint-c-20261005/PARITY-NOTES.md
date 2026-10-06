# Checkpoint C parity notes

## Method

- Real Debug app on the dedicated iPhone 17 Pro simulator (iOS 27), using Sandbox fixture data. The locked harnesses were built from the same fixtures.
- Each locked harness has its own width, so each is scaled independently to 402 pt:

  | Harness | Width | Typeface |
  |---|---|---|
  | Training | 390 px | Plus Jakarta Sans |
  | Nutrition/Activity | 379 px inside a 7 px bezel | Plus Jakarta Sans |
  | Weight | 372 px | SF Pro |

- The harness HTML was measured in headless Chrome (`measure2.mjs`) and reproduced in a themed kit. Two rendering rules had to be matched exactly:
  - **Chrome's "normal" line box:** ascent and descent are each rounded (Jakarta 1.038/0.222, SF 0.967/0.211).
  - **CSS border-box insets:** a 1 px border adds 1 px inside.
- Reference and simulator are aligned on the bottom of the navigation bar.
- Vertical ink runs were compared in two stages:
  1. The page head, before any real data difference.
  2. After re-aligning on the first matching section, where Sandbox shows an extra canonical row such as the Goal-phase pills.

## Back labels

- Locked back labels name the parent page ("‹ Aug 26", "‹ Shoulders").
- The Evidence tab keeps an ordered back trail: each page registers itself, and is removed when popped.
- Outside the Evidence tab, the label is "‹ Back", as in the locked T9.
- Review captures use a DEBUG trail seed only for pages that the deep-link launch skips.


## Audit: locked vs Build 87 vs Codex

Codex C kept Build 87's cards and navy palette. This candidate implements the locked systems:

- **Nutrition (Plus Jakarta Sans, teal):**
  - bordered scope pills;
  - a gradient hero day with Calories/Protein/Carbs/Fat/Fiber in macro inks;
  - a Reporting open list;
  - a 3-row ruled history with stacked teal ›;
  - a Summary with canonical `sourceEvidence` provenance ("Source · Typed evidence");
  - meal rows with slot glyphs, P/C/F macro line, and foods with servings;
  - reports with the Period Summary grid, 1M–All range pills, a teal trend field (32 px rules, ringed points, "avg" label and detail line), 108 px bar tracks, and a 128 px donut with a swatch legend.
- **Weight (record system, SF Pro):**
  - lime ↘ mark and rounded scope chips;
  - an open summary grid;
  - a legend and ruled trend field with dashed violet DEXA markers;
  - a selection and range row;
  - Rolling Averages;
  - inline Show All / Close for Weekly Averages and History.

## Measurements (pt, simulator minus reference)

| Surface | Theme | Head runs ≤ |
|---|---|---|
| N1 root | dark | 5 runs ≤ 2.0 |
| N1 root | light | 5 runs ≤ 2.0 |
| N3 day | dark | 6 runs ≤ 2.0 |
| N3 day | light | 6 runs ≤ 2.0 |
| N5 Calories | dark | 6 runs ≤ 2.0 |
| N5 Calories | light | 6 runs ≤ 2.0 |
| N6 Macros | dark | 6 runs ≤ 2.0 |
| N6 Macros | light | 6 runs ≤ 2.0 |
| N7 Meals | dark | 6 runs ≤ 2.0 |
| N7 Meals | light | 6 runs ≤ 2.0 |
| W1 Weight | dark | 4 runs ≤ 0.7 |
| W1 Weight | light | 4 runs ≤ 0.7 |

After re-aligning past the real phase-pill row:

| Section | Residual (pt) |
|---|---|
| Nutrition Day sections | ≤ 2.0 |
| Calories | ≤ 3.0 |
| Macros | ≤ 3.4 |
| Nutrition root (lower sections) | ≤ 3.4 |
| Weight sections | ≤ 0.3 |
| Meals | ≤ 7.4 |

The Meals residual is driven by real summary values: label wrapping, and "Lunch" vs the template's "Breakfast". It is not section geometry.

## Remaining differences (not geometry defects)

1. **System chrome**, as in Checkpoint B.
2. **Truthful data.**
   - **Sandbox defaults.** The default scope is Build Lean Mass, so Weight shows Highest instead of the template's Visible Abs Last Change, and the Goal-phase pill row appears.
   - **Fixture values differ:** chart shapes, Period Summary values, and the most common meal slot.
   - **Bar values.** Bars keep their canonical value and caption ("170g · 3 days", "500 cal · 5×") under the label. The template dropped them.
   - **Donut legend.** It keeps grams beside the percentage.
   - **N4 (totals-only day) is template-only.** No Sandbox day lacks meals; the code renders the locked panel.
   - **Weight state template (W2) is not reproduced.** No Sandbox weight state matches it.
3. **Rasterization**, as in Checkpoint B.

## Behavior and accessibility

- **Unchanged:**
  - Goal-filtered summaries, including Build Lean Mass "Highest";
  - weekly averages: same calculator, so the old bug is not reintroduced;
  - DEXA markers;
  - nutrition aggregation and reporting calculations;
  - day routes and Show All sheets.
- **Nutrition Areas:** the duplicate, non-navigating block is not presented. This is the locked Founder correction, and it removes no destination.
- **Charts:**
  - **Weight and Nutrition** now select by tap and scrub by horizontal pan. A vertical swipe that starts on a chart scrolls the page; the UI test proves this. The shared zero-distance drag overlay used to trap it.
  - **Not changed here:** the shared overlay is still used by DEXA, Energy and the Weekly/Monthly Briefings, which are outside this task.

## Tests

Same runs as Checkpoint B, including the Weight scroll/scrub, disclosure and Nutrition report UI tests.
