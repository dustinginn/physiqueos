# Build 85 Source Proof

Audited authority: Native Build 85 at `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

## Energy

`ios/PhysiqueOS/Presentation/Evidence/EnergyHistoryView.swift` proves the two history actions are independent modal sheets:

- lines 27–30 hold separate weekly and daily sheet state;
- lines 180–206 show the three-row Weekly History preview and present `EnergyWeeklyHistorySheet`;
- lines 209–235 show the three-row Recent Daily Energy preview and present `EnergyDailyHistorySheet`;
- lines 241–258 title the weekly sheet `Weekly History`;
- lines 261–279 title the daily sheet `Daily Energy History` and retain destination routing;
- lines 331–384 retain completeness states and conditionally expose `Nutrition Day` only when intake exists and `Activity` only when active-calorie evidence exists.

There is no product-facing explanation about the absence of an Energy day-detail route in the focused mockups.

## Weight

`ios/PhysiqueOS/Presentation/Evidence/WeightHistoryView.swift` resolves the ambiguous Show All behavior exactly:

- lines 25–26 define independent `isWeeklyAveragesExpanded` and `isHistoryExpanded` state;
- lines 195–218 render Weekly Averages through `EvidenceDisclosureRow`, switching from the first three weeks to all weeks inline;
- lines 220–239 do the same for Weight History;
- lines 241–257 change the same section-header action from `Show All` to `Close` when expanded;
- lines 491–523 implement a local button-driven animated disclosure in the existing root hierarchy.

Therefore neither Weight action opens a sheet or pushes a route. W1, W2 and W3 reproduce the collapsed and independently expanded states.

## Recovery

`ios/PhysiqueOS/Presentation/Evidence/RecoverySleepViews.swift` preserves the current hierarchy and disclosure contract:

- lines 411–413 and 621–633 keep root Recent Nights → Show All as an All Nights sheet, with night rows navigating to Night Detail;
- lines 476–517 keep Last Night navigation to Night Detail;
- lines 532–562 keep See trends and selected-night navigation;
- lines 732–734 and 911–923 keep Trends → All Nights as the same sheet pattern;
- lines 881–908 keep Stage Mix as an inline disclosure;
- lines 1166–1199 keep Source & Data as an inline disclosure with provenance.

`ios/PhysiqueOS/Presentation/Evidence/SleepEvidenceCharts.swift` lines 478–549 proves the current Continuity data contract:

- only `.available` nights become plotted points; unavailable nights remain gaps;
- Awake uses the exact `awakeInWindowSeconds / 60` values;
- Longest continuous sleep uses exact `longestAsleepStretchSeconds / 3600` values;
- the current Awake chart uses a wide `BarMark` and the current longest-sleep chart uses a `PointMark`.

R2 changes only those marks to thin point/line series. It does not change the rows, axes, selected values, range controls, missing-night status or accessibility meaning.

## Audited correction data

The focused 1M Continuity rendering preserves the accepted fixture rows from Sep 20 through Oct 1:

| Night | Awake | Longest continuous |
|---|---:|---:|
| Sep 20 | 19m | 1h 41m |
| Sep 21 | unavailable gap | unavailable gap |
| Sep 22 | 24m | 1h 48m |
| Sep 23 | 30m | 1h 47m |
| Sep 24 | 23m | 1h 47m |
| Sep 25 | 19m | 1h 37m |
| Sep 26 | 24m | 1h 30m |
| Sep 27 | 29m | 1h 35m |
| Sep 28 | 27m | 1h 40m |
| Sep 29 | 20m | 1h 48m |
| Sep 30 | 33m | 1h 12m |
| Oct 1 | 34m | 1h 33m |

Night Detail retains 59m Deep, 4h 12m Core, 1h 18m REM and 20m awake in the sleep window.
