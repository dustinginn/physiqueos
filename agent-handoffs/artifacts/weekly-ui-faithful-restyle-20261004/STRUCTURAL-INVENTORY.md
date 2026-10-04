# Weekly Briefing Build 85 structural inventory

Authority: Native Build 85 `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

Rendering fixture: the unchanged repository fixture `weekly_briefing_2026-08-23_2026-08-29` copied verbatim from `ios/PhysiqueOS/Resources/BriefingsFixture.json` into `NATIVE-BRIEFINGS-FIXTURE.json`.

| ID | Production component / content | Parent | Conditional rule | Visualization |
|---|---|---|---|---|
| W01 | `BriefingDetailPreHeroNavigation`: Home; Briefing History | `BriefingDetailView` | Always | None |
| W02 | `BriefingLeadCard`: integrated lead container | `WeeklyBriefingSections` | Always | None |
| W03 | Weekly Briefing eyebrow; completed-week range | W02 | Always | None |
| W04 | Persisted Confidence score, band, movement and primary reason | W02 | When Confidence is present | 68% ring |
| W05 | Exact hero headline | W02 | Always | None |
| W06 | Exact hero narrative | W02 | Always | None |
| W07 | Strategy, Week and Next footer items | W02 | Each supplied item | None |
| W08 | `WeeklyEnergyCard` | `WeeklyBriefingSections` | When Energy is present | Contains W15 |
| W09 | Energy heading and paired-day coverage | W08 | Always with Energy | None |
| W10 | Legacy Energy title, balance statement and narrative | W08 | Used when `canonicalV3` is absent | None |
| W11 | Comparison narrative | W08 | Only when non-empty; absent in chosen fixture | None |
| W12 | Daily semantic rows | W08 | Only when `showsDailySemanticRows`; default false | None |
| W13 | Average intake, expenditure and balance metrics | W08 | Always with Energy | None |
| W14 | `Daily intake vs estimated expenditure` chart title | W08 | With non-empty daily balances and chart enabled | None |
| W15 | `WeeklyEnergyCard.chart` | W08 | With non-empty daily balances and chart enabled | Grouped bars, 7 days, 14 marks |
| W16 | Intake / Estimated expenditure legend | W08 | With W15 | Two-series legend |
| W17 | Weight Context card | `WeeklyBriefingSections` | When Weight is present | None |
| W18 | Average weight and weekly change | W17 | Always with Weight | None |
| W19 | Exact Weight narrative | W17 | When non-empty | None |
| W20 | Photos card | `WeeklyBriefingSections` | Narrative non-empty or destination present | None |
| W21 | Exact Photos narrative | W20 | When non-empty | None |
| W22 | View Photo Briefing link | W20 | When destination is present; absent here | None |
| W23 | `BriefingTrainingResponseCard` | `WeeklyBriefingSections` | When Training is present | None |
| W24 | Training Response heading | W23 | Always with Training | None |
| W25 | Exact Training headline | W23 | When non-empty | None |
| W26 | Exact Training narrative | W23 | When non-empty | None |
| W27 | Training coverage line | W23 | Server-owned counts, Native-established sentence | None |
| W28 | Highlights heading plus three existing highlight cards | W23 | When highlights are non-empty | None |
| W29 | Priority Muscle Groups heading plus four existing rows | W23 | When groups are non-empty | None |
| W30 | Training watch | W23 | When watch message is non-empty; absent here | None |
| R-FUTURE | Recovery V1 design fixture | `WeeklyBriefingSections` | Future-only; exactly once after Training | None |
| W31 | Body Composition card | `WeeklyBriefingSections` | When Body Composition is present; absent here | None |
| W32 | `BriefingUncertaintyCard`: Still Unresolved | `WeeklyBriefingSections` | Only presentable Server-surfaced uncertainty; absent here | None |
| W33 | `BriefingCoachFinale` | `WeeklyBriefingSections` | Always in Weekly | None |
| W34 | Biggest Takeaway | W33 | When non-empty | None |
| W35 | What To Do | W33 | When non-empty | None |
| W36 | Into Next Week, ordered actions | W33 | When actions are non-empty | None |
| W37 | Revision banner and original publication context | `BriefingDetailView`, after sections | When revision provenance is present | None |

The production sequence and parent mapping are machine-checked in `validation.json`. Removing `R-FUTURE` from either restyle produces the exact baseline sequence and parent map.
