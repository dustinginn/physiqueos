# Checkpoint C (Nutrition + Weight): drawer, route and interaction regression proof

The Founder approved C visually, so this package adds no new boards. This file proves that every existing drawer, sheet, disclosure, route and interaction still works, compared against Build 87 (`f66c7fc6`) source.

## Source audit against Build 87

| Surface | Build 87 | Candidate |
|---|---|---|
| Nutrition root | history Show All sheet; Reporting rows (destination → report, no destination → informational); history rows → Nutrition Day; scope | same set. Reporting rows without a destination are now kept as informational rows; the first C pass had filtered them out (none exist in Sandbox), so this restores Build 87 behavior |
| Nutrition root, Nutrition Areas block (informational, non-navigating) | shown | not shown, per the **locked Founder correction `8e6bd94b`** that C was approved against. It had no route or action |
| Nutrition Day | no controls or sheets | none (Summary, Totals, Meals, totals-only panel, loading/failure/empty) |
| Nutrition reports | 7 sheets: Calories weekly/daily, Macros weekly/daily, Meals weekly / recurring / history | all 7 kept through one shared `rowsSection` (each is still its own `.sheet(isPresented:)` binding) |
| Nutrition report rows → Nutrition Day | daily calories, daily macros, meal history (preview and sheet) | same |
| Range, macro, meal-slot and metric filters | range pills, macro pills, macro-mix slot pills, trend slot pills, metric menu | same |
| Charts | trend scrub, bars, donut | same; scrub is now tap plus horizontal-only pan (Part 4) |
| Weight | scope pills; Weekly Averages and History inline Show All / Close; chart scrub/tap; DEXA markers (decorative `RuleMark`s, no interaction in B87) | same; no sheets in either version |
| Weight correction/detail sheet | none in Build 87 | none (none invented) |
| Lifecycle (`.task`, `.refreshable`, foreground and day-change reload) | — | identical modifier set in every C file |

## Deterministic UI proof (`EvidenceTrainingNutritionWeightUITests`, Sandbox)

| Test | Proves |
|---|---|
| `testNutritionRootReportsAndDay` | the three report routes exist; Calories report opens; Nutrition Day opens with Summary and Meals; Areas block hidden |
| `testNutritionRootHistoryDrawerAndScope` | 3-row history preview row → Nutrition Day → back; Show All sheet has more than 3 rows; a sheet row → Nutrition Day → back; Done dismisses; Goal/phase scope switch re-reads |
| `testNutritionCaloriesRangeScrubAndDailyDrawer` | range filter "All" selects; horizontal scrub changes the selected week; Weekly Averages and Recent Daily Calories sections present; daily drawer row → Nutrition Day → back → Done; weekly drawer opens/closes when present |
| `testNutritionMacroSwitchingAndMealsDrawers` | macro switch (Carbohydrates selected); Recent Daily Macros drawer; Meals report: metric menu switches to Protein; Dinner slot filter selects; weekly/recurring drawers open/close when present; meal-history drawer row → Nutrition Day → back → Done |
| `testWeightChartScrubsHorizontallyAndScrollsVertically` | horizontal pan scrubs; a vertical swipe starting on the chart scrolls the page |
| `testWeightScopeTapSelectionAndBothInlineDisclosures` | a tap selects a different entry; Weekly Averages and Weight History each expand in place and close again (Show All → Close → Show All); scope switch re-reads |
| `testWeightInlineDisclosureNeverAddsARoute` | Show All expands in place, with no new route |

To make these tests deterministic, I added accessibility identifiers only, with no visual change:

- Drawer Done buttons: `evidence.sheet.done`.
- Drawer row sections: `nutrition.report.rows.<title>` and `.showAll`.
- Report day rows: `nutrition.report.day.<id>`.
- Pills: `nutrition.report.range.<id>`, `nutrition.report.macro.<label>`, and `nutrition.report.{mixSlot,trendSlot}.<label>`.
- Metric menu: `nutrition.report.metricSelector`.
- Chart readout: `nutrition.report.trend.selection`.
- History rows: `nutrition.history.day.<date>` and `activity.history.day.<date>`.

## Part 4: chart gesture fix (kept, not broadened)

Weight and Nutrition charts keep:

- tap to select;
- horizontal-only pan (UIKit recognizer) to scrub;
- vertical swipes pass through to the page.

Both UI tests above prove this. The DEXA, Energy and Briefing charts still use the shared overlay, as instructed; that note stays with their owning checkpoints.
