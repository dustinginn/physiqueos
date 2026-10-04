# Source audit

## Authority

Native source was audited at exact SHA `b8ee8690b194cb90086b62816b9a2c8c400dc026` (Build 85). Prompt authority is `fbd6dd35e4e0dbabe5834d309170dcd2e724398a`.

The audit covered presentation, view models, transport/read models, fixture semantics, routing and current web/server Evidence services where present. The design harness is a translation layer only.

## Energy

Primary files:

- `Presentation/Evidence/EnergyHistoryView.swift`
- `Presentation/Evidence/EnergyChartViews.swift`
- `Presentation/Evidence/EnergyHistoryViewModel.swift`
- `Contracts/EnergyReadModel.swift`
- `Contracts/EnergyEvidenceCalculator.swift`
- `Networking/EnergyAPI.swift`
- `Resources/EnergyFixture.json`
- current Server/web: `src/domain/services/EnergyEvidenceService.js`, `EnergyDailyReconciliationService.js`, `EnergyWeeklyAggregationService.js`, and `src/app/progress/energy/page.js`

Findings:

- One page, not a route tree. Loaded order is header → scope → Period Summary → Energy Over Time → Weekly Energy Balance → Weekly History → Recent Daily Energy.
- Weekly History and Recent Daily Energy each preview three records and open distinct Show All sheets.
- There is no Energy day-detail route. A daily row may open the existing Nutrition root and/or Activity root if that evidence exists.
- Period Summary is exactly Average Intake, Average Expenditure, Average Balance and Complete Days.
- Energy Over Time is weekly average intake versus estimated expenditure, with solid amber intake and dashed blue estimated-expenditure series and the existing 1M/3M/6M/1Y/All selector.
- Weekly Energy Balance is the existing latest-four-weeks intake/expenditure bar comparison.
- Daily completeness labels remain `Complete · Estimated`, `Nutrition only`, `Activity only`, `Missing RMR`, and `No paired evidence`.
- Intake, active calories, RMR-backed estimated expenditure and signed balance remain distinct. No precision or target was added.
- Loading, failure, empty weekly history and empty daily history are inline states.
- Fixture `dataSources` exist in transport data, but Build 85 `EnergyHistoryView` does not render a Data Sources section. The target does not invent one.

## Weight

Primary files:

- `Presentation/Evidence/WeightHistoryView.swift`
- `Presentation/Evidence/WeightHistoryViewModel.swift`
- `Contracts/WeightReadModel.swift`
- `Contracts/WeightEvidenceCalculator.swift`
- `Networking/WeightEvidenceAPI.swift`
- `Resources/WeightFixture.json`
- current Server/web: `src/screens/WeightReportScreen.jsx`, `src/domain/services/WeightEvidenceContextService.js`

Findings:

- Weight is genuinely one page. There is no day detail, separate history sheet, clickable history row, streak or Related Goals route.
- Loaded order is header → scope → four Goal-dependent summary cards → Weight Trend → optional server rolling averages → Weekly Averages disclosure → Weight History disclosure.
- Summary semantics are literal and Goal-dependent:
  - Build Lean Mass: Latest, Since Start, Highest, Lowest.
  - Visible Abs: Latest, Since Start, Last Change, Lowest.
  - All/unrecognized: Latest, Since First, Highest, Lowest.
- The graph uses the existing tight data-driven domain, hollow observation points, selected solid point and purple dashed full-height DEXA markers.
- A selected point exposes date/value; with no selection the latest point is the default.
- Fewer than two valid points produces `More history needed`.
- Founder Production may provide canonical rolling 3-day/7-day averages; a window can be `Pending` with observation count retained.
- Weekly Averages and Weight History each preview three rows and expand inline with Show All/Close. This satisfies root history discoverability without inventing a full-history route.
- Fixture source entries include future/suggested providers, but Build 85 loaded view does not render Data Sources. Target design therefore shows no future provider UI.

## Recovery

Primary files:

- `Presentation/Evidence/RecoverySleepViews.swift`
- `Presentation/Evidence/RecoverySleepViewModels.swift`
- `Presentation/Evidence/SleepEvidencePresentation.swift`
- `Presentation/Evidence/SleepEvidenceCharts.swift`
- `Contracts/RecoverySleepReadModel.swift`
- `Contracts/RecoverySleepScope.swift`
- `Networking/RecoverySleepAPI.swift`
- `Resources/RecoverySleepFixture.json`

Current Server resource contracts decoded by Native:

- `recovery-sleep-landing`
- `recovery-sleep-trends`
- `recovery-sleep-night`

Findings:

- Root order: header/scope → Last Night or Final Night → 14-night Sleep chart → Sleep Window → Recent Nights (three) → Data Sources.
- Root Recent Nights opens a paged All Nights sheet; rows open Night Detail. Trends is a distinct route and can also open All Nights.
- Trends ranges are 2W/1M/3M/6M/All. Night granularity shows Total Sleep, Sleep Window, Continuity, collapsible Stage Mix and All Nights. Longer ranges switch to weekly averages and intentionally omit window/continuity/stage detail with explanatory copy.
- Night Detail order: header/finality → Timeline → Stages → Continuity → optional Time in Bed → optional Additional Sleep → Source & Data.
- Stage states are available, pending correction, absent, and tolerant unknown. Pending correction preserves final total/timing while stage and awake detail recalculate.
- `windowOpen` is presented as still updating; historical import clock uncertainty is non-color copy and excludes that night from window consistency, without changing total sleep.
- Provenance names the counted source (for example Oura via Apple Health), corroborating sources as not counted, time-zone basis, window inclusion, stage status, origin, recomputation time and algorithm version.
- One source is counted per night. Secondary sleep remains additive and separately labeled.
- Scope can be loading, failed, empty, or available. Resource states include loading, unavailable, no data/not found, failed and loaded; All Nights adds pagination/loading-more.
- Server `strategicUse` remains quarantined and night `strategicEligible` remains false. No Recovery Score or strategic interpretation exists in the target.

## Locked-family carry-forward

- Training Evidence stays locked with all 10 canonical Training Areas.
- Nutrition stays locked with Recent Nutrition History, three rows, Show All, functional Calories/Macros/Meals, no duplicate aggregation or future UI.
- Activity stays locked with Recent Activity History, three rows, Show All, current informational fields/Linked Training Context, no invented Reporting, and Cooldown non-Cardio.

