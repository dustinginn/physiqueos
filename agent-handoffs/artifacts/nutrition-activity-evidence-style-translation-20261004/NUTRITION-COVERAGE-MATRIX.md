# Complete Nutrition Evidence coverage matrix

Legend: **Direct** = rendered mock. **Template** = explicitly mapped to a rendered representative with identical layout behavior. No current screen/state is left implicit.

| Screen/state | Current source component | Data shown | Navigation in/out | Proposed template | Mocked? | Covered? |
|---|---|---|---|---|---|---|
| Evidence Hub Nutrition row | `EvidenceView`, `EvidenceStreamRowView` | Nutrition title/latest summary | Evidence tab → root | Existing stream-row system | Template N1 entry | Yes |
| Evidence Hub loading/failure | `EvidenceView` | progress/error | Tab entry | Shared async field | Template N8 | Yes |
| Root loading | `NutritionHistoryView` | progress | row → root | Centered accent progress | N8 | Yes |
| Root failure | `NutritionHistoryView` | `Nutrition could not be loaded.` | root | Plain readable failure | N8 | Yes |
| Root loaded | `NutritionHistoryView` | header, scope, latest, functional reporting, three-row history preview | root → descendants | Analytical open sections with Recent History at bottom | Corrected N1 + focused correction | Yes |
| Goal/phase/all scope | scope selector | options/date range | local re-fetch | Quiet pills + date | N1/N5/N7 | Yes |
| Latest day populated | latest card | date, canonical totals, meal count | root → day | Contained hero + totals | N1 | Yes |
| Latest day empty | latest card | current upload/connect copy | root | Open empty copy | Template N8 | Yes |
| Reporting links | reporting card | Calories, Macros, Meals | root → report | Divided read-only links | N1 | Yes |
| Nutrition Areas source block | areas card/read model | three duplicate informational categories plus three future-only placeholders; no current Native destination | root only | Hidden by Founder target; functional Calories/Macros/Meals remain in Reporting and all valid day fields remain | Documented removal | Yes |
| Recent History preview | history card | exactly three newest-first canonical days | root → Nutrition Day | Open date rows at bottom of root | Corrected N1 + focused dark/light | Yes |
| Show All history sheet | history sheet | same canonical day collection, all days | root preview → sheet → Nutrition Day | Existing chronological full-history list | N2 unchanged | Yes |
| Recent History empty | history card | current empty copy | root | Open empty copy | Template N8 | Yes |
| Day loading/failure/not found | `NutritionDayView` | progress/exact messages | day route | Shared state field | N8 | Yes |
| Structured Nutrition Day | `NutritionDayView` | date, summary, five totals, meal details | day | Read-only canonical total + meal breakdown | N3 | Yes |
| Partial structured meal | meal row | partial/completeness copy + available values | day | Same meal template; unavailable values remain absent | Template N3 | Yes |
| Totals-only Apple Health day | `NutritionDayView` | day totals, no meals | day | Canonical totals + exact empty copy | N4 | Yes |
| Day with no macros/meals | `NutritionDayView` | `No meals recorded for this day.` | day | Honest empty Meals section | N8 | Yes |
| Calories report loading/failure/not found | `NutritionReportingView` | progress/messages | root → report | Shared async field | N8 | Yes |
| Calories Period Summary | calories report | avg/logged/low/high/target availability | report | Compact summary grid | N5 | Yes |
| Calories Over Time | chart view | current range, weekly series, selected point | report | Existing chart restyled only | N5 | Yes |
| Weekly Averages + sheet | reporting rows | week averages/counts | report → sheet | Same open list | Template N5 | Yes |
| Recent Daily Calories + sheet | reporting rows | date/calories/meals | report → sheet → day | Same open list | N5 | Yes |
| Macros report + selector | macro report | selected macro, period scope | root → report | Pills + analytical sections | N6 | Yes |
| Macro Distribution | chart view | existing P/C/F distribution | report | Existing donut restyled | N6 | Yes |
| Average Daily Macros | chart view | average P/C/F | report | Existing bars restyled | N6 | Yes |
| Macro Trends Over Time | chart view | selected macro/range series | report | Existing trend restyled | Template N6 | Yes |
| Macro weekly/recent sheets | reporting rows | weekly/daily macro values | report → sheet → day | Open list | Template N6 | Yes |
| Meals report Period Summary | meals report | detailed-day/slot/calorie/day summary | root → report | Summary grid | N7 | Yes |
| Meal Distribution | chart view | existing average-by-slot bars | report | Existing bars restyled | N7 | Yes |
| Meal Macro Mix | chart view | slot selector + P/C/F distribution | report | Existing donut restyled | N7 | Yes |
| Meal Trends Over Time | chart view | slot/metric/range trend | report | Existing trend restyled | Template N7 | Yes |
| Weekly Meal Summary sheet | reporting rows | weekly meal summaries | report → sheet | Open list | Template N7 | Yes |
| Recurring Meals sheet | reporting rows | food/slot/last/count/average | report → sheet | Open list | N7 | Yes |
| Recent Meal History sheet | reporting rows | meal history | report → sheet → day | Open list | Template N7 | Yes |

## Result

- Direct Nutrition templates: **8**
- Dark/mineral-light renders: **8 + 8**
- Uncovered current states: **0**
- Invented charts/routes/actions: **0**
- Duplicate-count implication: **0**
- User-facing future-only placeholders/dead destinations: **0**
