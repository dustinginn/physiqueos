# Token and component mapping

## Locked Evidence language

| Role | Dark | Mineral light | Use |
|---|---|---|---|
| Canvas | deep navy | warm mineral | page background |
| Primary ink | warm near-white | ink/navy | headings and values |
| Secondary ink | cool gray | slate | descriptions, units, provenance |
| Evidence accent | acid/mineral green | forest mineral | navigation/action/selection only |
| Analytical field | layered navy/teal | pale mineral/teal | charts and compact metrics |
| Divider | restrained blue-gray | warm stone | open-list rhythm |
| Intake | amber | ochre | Energy intake only |
| Estimated expenditure | blue | deep blue | Energy expenditure only |
| Weight trend | fixed blue | fixed accessible blue | unchanged chart identity |
| DEXA marker | violet | violet | dashed marker + dot |
| Total sleep | teal | deep teal | nightly/weekly sleep |
| Deep/Core/REM/Awake | indigo/blue/violet/amber | darker equivalents | explicit stage labels plus color |

## Reusable primitives

- Evidence screen header and back chrome.
- canonical Goal/phase scope selector.
- open-list section with 44pt rows and optional Show All.
- compact two-column stat/metric rail.
- selective analytical container for charts and dense evidence.
- range selector with selected state that does not rely on color alone.
- provenance disclosure and key/value detail rows.
- factual status tag with text (`Updating`, completeness, source role).
- loading/failure/no-data panels.

## Family components

Energy:

- `EnergySummaryGrid`
- `EnergyTrendChart` (solid intake / dashed estimated expenditure)
- `WeeklyEnergyBalanceChart`
- `EnergyWeekHistoryRow`
- `EnergyDayHistoryRow`

Weight:

- `WeightSummaryGrid` fed by unchanged Goal-dependent labels
- `WeightTrendChart` with selected-point and DEXA overlay
- `RollingAverageTile`
- `WeightWeeklyAverageRow`
- `WeightHistoryRow`
- inline `EvidenceDisclosureRow`

Recovery:

- `SleepTotalChart`
- `SleepWindowChart`
- `SleepContinuityChart`
- `SleepStageMixChart`
- `SleepHypnogram`
- `SleepStageBar` and explicit stage rows
- `RecoverySleepNightRow`
- `SleepStatusTag`, `SleepRecalculatingNote`, `SleepScopeStateCard`
- `Source & Data` disclosure

Rows remain read-only and visually differ from Logger controls: no checkmarks, input chrome, swipe affordance or completion controls.

## Accessibility contract

- Dynamic Type must reflow metric grids into one column before truncating values.
- All list actions and chart selection affordances retain at least 44×44pt targets.
- VoiceOver chart summaries state series name, period, value and unit; Energy distinguishes estimated expenditure; Weight announces DEXA markers; Recovery identifies nightly versus weekly values.
- Status always has text; stage names never depend on color.
- Units are included in spoken labels (`calories`, `pounds`, `hours/minutes`).
- Approximate clock-time and updating/finality states are explicit in text.

