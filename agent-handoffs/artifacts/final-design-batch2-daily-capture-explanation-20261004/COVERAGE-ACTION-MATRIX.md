# Coverage and action matrix

| Group | Surface/state | Canonical content/behavior represented | Action/navigation |
|---|---|---|---|
| Confidence | V3 loaded | Score, qualitative band, why, five factor groups, next evidence, Coach's take; empty groups conditional; Assumptions absent | Sheet drag/dismiss remains system-owned |
| Confidence | historical V2 | Summary, movement/support/limit/clarifying groups and conditional uncertainty ownership | Same Home sheet; no new route |
| Morning | unfinished priorities | Multiple occurrence-keyed rows, required disposition, always-available optional note, weight last | Complete Morning Weigh-In atomically saves weight + dispositions |
| Morning | existing weight | Today's canonical value prefilled | Same atomic completion |
| Morning | no reconciliation | Priority block omitted, Weight remains | Same completion |
| Morning | validation | Missing/invalid weight error | Remains on form |
| Morning | saving | Disabled Saving… action | No duplicate submit |
| Morning | uncertain outcome | Exact still-reconciling copy | Safe to leave or retry same submission |
| Morning | complete | Durable success summary | Return Home/dismiss |
| Weight | new date | Date, empty numeric field, unit | Save Weight |
| Weight | existing date | Canonical value prefilled for selected date | Correction uses expected revision |
| Weight | validation | Range validation state | Remains on form |
| Weight | saving | Disabled Saving… action | No duplicate submit |
| Weight | uncertain outcome | Exact still-reconciling copy | Save remains available for idempotent retry |
| Weight | success | Exact dated success copy | Return to Log appears |
| Weight | failure | Native-safe failure copy | Save remains available |
| History | populated | All five supported families in newest-first cross-cadence chronology | Exact artifact row opens shared detail |
| History | empty | Exact empty copy | Back only |
| History | loading | Read in progress | Back remains available |
| History | failed | Exact load-failure copy | Back remains available; no unsupported retry invented |

Every row above is rendered in dark and Mineral Light with identical content and geometry. No locked Home, Log, Weight Evidence, briefing-detail or Priority Detail composition is reopened.
