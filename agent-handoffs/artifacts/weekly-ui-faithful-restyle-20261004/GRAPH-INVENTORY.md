# Weekly graph inventory and hard gate

Build 85 contains exactly one data graph in the Native Weekly Briefing.

## W15 — daily intake vs estimated expenditure

- Source: `WeeklyEnergyCard.chart(_:)` in `WeeklyBriefingSections.swift`.
- Page position: inside Energy, after the three average metrics and chart title.
- Semantic type: grouped bar chart.
- X domain: one categorical ISO date per day; visible labels are an explicit point label when supplied, otherwise the final two date digits.
- Y values: intake kcal and expenditure kcal; the Native Y axis is hidden.
- Series: `Intake` and `Estimated expenditure`.
- Chosen fixture: seven paired days, labels 23–29, fourteen bars.
- Missing-data behavior: an unpaired point receives a dashed vertical rule.
- Rendering condition: `showsChart == true` and `dailyBalances` is non-empty. Otherwise the metrics remain and title/chart/legend are omitted.
- Interaction: the production chart supports the shared categorical chart-scrub gesture. The static review artifact preserves the chart semantics and visible state but does not change shipping interaction behavior.

The validator compares every bar's series, date and value with the copied Build 85 fixture, plus chart type, title, labels, point count, legend series and Energy parent. A missing or altered W15 fails rendering. Both faithful appearances passed.

No Weight, Training, Photos, Body Composition, uncertainty or Coach graph exists in the current Native Weekly screen. None was invented.
