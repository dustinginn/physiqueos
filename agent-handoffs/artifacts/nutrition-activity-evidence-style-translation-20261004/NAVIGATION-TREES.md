# Independent current navigation trees

## Nutrition Evidence

```text
Evidence Hub
└─ Nutrition stream row
   └─ NutritionHistoryView
      ├─ Scope selector (goal / phase / All Nutrition; local re-fetch)
      ├─ Latest Nutrition Day → NutritionDayView
      ├─ Reporting
      │  ├─ Calories → NutritionReportingView(.calories)
      │  │  ├─ Weekly Averages sheet
      │  │  └─ Recent Daily Calories sheet → NutritionDayView
      │  ├─ Macros → NutritionReportingView(.macros)
      │  │  ├─ Weekly Averages sheet
      │  │  └─ Recent Daily Macros sheet → NutritionDayView
      │  └─ Meals → NutritionReportingView(.meals)
      │     ├─ Weekly Meal Summary sheet
      │     ├─ Recurring Meals sheet
      │     └─ Recent Meal History sheet → NutritionDayView
      └─ Recent Nutrition History
         ├─ Three-row root preview → NutritionDayView
         └─ Show All sheet → NutritionDayView
```

The Build 85 read model still carries a six-row Nutrition Areas collection, but the three current categories duplicate functional Reporting and the remaining three are future-only placeholders. Founder target hides that entire non-navigating block rather than advertising roadmap. No current data field is removed from Nutrition Day or Reporting. There is no current Native Nutrition library route, enrichment-review route, correction flow, or standalone Data Sources page.

## Activity Evidence

```text
Evidence Hub
└─ Activity stream row
   └─ ActivityHistoryView
      ├─ Scope selector (goal / phase / All Activity; local re-fetch)
      ├─ Today / Latest Activity Day → ActivityDayView
      ├─ Activity Areas (four informational metrics; no route)
      ├─ Linked Training Context (preview; no route)
      └─ Recent Activity History
         ├─ Three-row root preview → ActivityDayView
         └─ Show All sheet → ActivityDayView
```

There is no current Native Activity reporting route, chart, workout list, workout detail, workout-type classifier, correction flow, or standalone Data Sources page.
