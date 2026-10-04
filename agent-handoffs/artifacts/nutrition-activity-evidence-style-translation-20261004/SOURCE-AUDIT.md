# Build 85 Nutrition + Activity Evidence source audit

## Authority

- Prompt: `eb186ba2bb0862daf4f487c334ef445336bcab46`
- Native source: `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85)
- Audit checkout: `/private/tmp/physiqueos-build85-native`

The two families were audited independently. Neither hierarchy was inferred from Training.

## Nutrition Evidence

### Entry, root, and history

`EvidenceView` / `EvidenceStreamRowView` opens `NutritionHistoryView` through `AppDestinationRouterView`.

Loaded order is fixed: Evidence Report header → goal/phase/all scope selector and date range → Latest Nutrition Day → Reporting → Nutrition Areas → Recent Nutrition History. Recent History shows three rows and a Show All sheet; every day row opens `NutritionDayView`.

Reporting has exactly three current destinations: Calories, Macros, Meals. Nutrition Areas has six informational rows: Calories, Macros, Meals, Micronutrients, Supplements, Hydration. The latter three retain the live `Coming soon` treatment and do not gain destinations.

Root states: loading, failure (`Nutrition could not be loaded.`), loaded, latest-day empty, history empty, and Show All sheet.

### Nutrition Day

`NutritionDayView` renders the date/header, Summary, five Totals in fixed order (Calories, Protein, Carbohydrates, Fat, Fiber), then Meals.

Structured meal rows preserve slot, optional name, completeness copy, calories, P/C/F, foods, brand, and serving. Two empty cases remain distinct:

- daily macros exist, no structured meals: `Daily totals only. No meal detail for this day.`
- neither daily macros nor meals exist: `No meals recorded for this day.`

Route states: loading, failure (`Nutrition day could not be loaded.`), not found (`No nutrition evidence for this day.`), structured meals, partial meals, and totals-only day.

### Nutrition Reporting

`NutritionReportingView` owns three routes with common loading/failure/not-found handling.

- Calories: Period Summary → Calories Over Time with current 1M/3M/6M/1Y/All range control and point detail → Weekly Averages + sheet → Recent Daily Calories + sheet.
- Macros: macro selector → Period Summary → Macro Distribution → Average Daily Macros → Macro Trends Over Time → Weekly Averages → Recent Daily Macros.
- Meals: Period Summary → Meal Distribution → Meal Macro Mix with slot selector → Meal Trends Over Time with slot/metric/range controls → Weekly Meal Summary → Recurring Meals → Recent Meal History.

Only these existing chart families were styled. No chart, target, coaching, score, or route was added.

### Canonical Nutrition aggregation and provenance

`NutritionReportingCalculator` derives all summaries and charts from the same canonical scoped `[NutritionDayRecord]`. A structured meal collection is a reconciled decomposition of its day record, not a second total. `sourceEvidence` and `dataSources` are carried by the read model; source language must remain scoped provenance and must never visually invite addition across sources.

Build 85 does not render a standalone Data Sources route/card and does not render a Nutrition correction/review flow. None was invented. The mock's compact `Source · Typed evidence` / `Source · Apple Health` line is a conservative presentation of existing per-day provenance, not a new data input or total.

Exact fixtures used include Aug 30 structured totals (2140 cal, 180P, 220C, 90F, 28 fiber, four meals) and the test-backed Sep 21 Apple Health totals-only day (2140 cal, 182P, 205C, 68F, zero meals).

## Activity Evidence

### Entry, root, and history

`EvidenceView` opens `ActivityHistoryView`. Loaded order is fixed: header → scope/date range → Today/Latest Activity Day → Activity Areas → Linked Training Context → Recent Activity History. Activity Areas are four informational metrics: Active Calories, Exercise Minutes, Workout Activity, Non-Workout Activity. They are not reporting links.

Recent History shows three rows and a Show All sheet; rows open `ActivityDayView`. Linked Training Context is a non-navigating preview.

Root states: loading, failure (`Activity could not be loaded.`), loaded, latest-day empty, linked-context empty, history empty, and Show All sheet.

### Activity Day

`ActivityDayView` renders header/detail/protocol status followed by exactly eight metrics in production order:

1. Active Calories
2. Total Calories
3. Exercise Minutes
4. Stand Hours
5. Workout Calories
6. Non-Workout Calories
7. Move Goal
8. Linked Workouts

It also preserves the optional `Still updating from Apple Health` treatment and exact provisional anomaly copy when workout energy temporarily exceeds the partial active total. Route states are loading, failure (`This activity day could not be loaded.`), not found (`No activity evidence for this day.`), complete day, and partial/in-progress day.

Exact fixture: Aug 30 has 612 active, 2860 total, 48 exercise minutes, 11 stand hours, 402 workout, 210 non-workout, 650 move goal, one linked workout. Exact partial-day test: Sep 28 has 171 active / 26 minutes so far, 567 workout, 0 non-workout, three linked workouts, total and move goal pending.

### Activity semantics and workout classification

Build 85 Activity has no reporting route, chart, workout-detail list, or workout-type classification UI. Its workout/non-workout calories are attribution inside whole-day active energy; they are not added again to active or total energy.

Linked Training Context does not create a Training route and does not retag a workout. Cooldown/Run/Stair Stepper classification belongs to canonical Training/HealthKit evidence, outside the Activity day aggregate. This styling work therefore adds no workout list. If those canonical records are encountered elsewhere, Cooldown remains neutral `other` and excluded from Cardio; Run and Stair Stepper remain Cardio.

`dataSources` exists in the read model but Build 85 does not render an Activity Data Sources section. No source card was invented.

## Shipping isolation

No files under shipping Native or Server paths were changed. The source checkout was read-only. All output lives under this disposable artifact root plus handoff documentation.
