# Weekly graph inventory and hard gate

Build 85 contains exactly one data graph in the Native Weekly Briefing.

## W15 — daily intake vs estimated expenditure

- Source: `WeeklyEnergyCard.chart(_:)` in `WeeklyBriefingSections.swift`.
- Page position: inside Energy, after the three average metrics and chart title.
- Production semantic type: grouped bar chart. The wide-leash pass is permitted to transform graphical form while keeping the same paired comparison.
- X domain: one categorical ISO date per day; visible labels are an explicit point label when supplied, otherwise the final two date digits.
- Y values: intake kcal and expenditure kcal; the Native Y axis is hidden.
- Series: `Intake` and `Estimated expenditure`.
- Chosen fixture: seven paired days, labels 23–29, fourteen bars.
- Missing-data behavior: an unpaired point receives a dashed vertical rule.
- Rendering condition: `showsChart == true` and `dailyBalances` is non-empty. Otherwise the metrics remain and title/chart/legend are omitted.
- Interaction: the production chart supports the shared categorical chart-scrub gesture. The static review artifact preserves the chart semantics and visible state but does not change shipping interaction behavior.

The validator compares every mark's series, date and value with the copied Build 85 fixture, plus source chart type, title, point count, legend series and Energy parent. A missing or altered W15 point fails rendering. All three concepts passed.

No Weight, Training, Photos, Body Composition, uncertainty or Coach graph exists in the current Native Weekly screen. This pass adds only source-bound Training count and comparable-exercise-count geometry; it does not invent a production chart, statistic or missing source point. Weight, Recovery, Photos and qualitative copy remain ungraphed.
