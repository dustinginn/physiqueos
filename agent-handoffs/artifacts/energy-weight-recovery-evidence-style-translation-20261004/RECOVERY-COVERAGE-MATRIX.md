# Recovery coverage matrix

Every Build 85 route and state is directly rendered or mapped to a visually equivalent template. Uncovered states: **0**.

| Current route/state | Contract behavior | Template | Coverage |
|---|---|---|---|
| Root loaded/current scope | Last Night, charts, history, sources | R1 | direct |
| Root historical Goal scope | `Final Night` label; same content order | R1 | direct component mapping |
| Root 14-night Sleep chart | nightly total + 7-night average; selected night opens detail | R1 | direct; selected rail maps to row grammar |
| Root Sleep Window | reliable nights + consistency summary; uncertain nights excluded | R1 | direct |
| Root Recent Nights | first three; Show All | R1 | direct |
| Root Data Sources | counted vs also-recorded; no double count | R1 | direct |
| Trends 2W/1M/3M | Total Sleep, Window, Continuity, Stage Mix, All Nights | R2 | direct |
| Trends selected point | total + 7-night average stat tiles | R2 stat grammar | explicit mapping |
| Trends truncated nightly data | latest-N explanatory note | R2 footnote grammar | explicit mapping |
| Trends 6M/All | weekly averages; detailed charts withheld | R3 | direct |
| Stage Mix collapsed | action + source-estimate note | R2 | direct |
| Stage Mix expanded | existing stacked chart | R4 stage color grammar | representative chart template |
| All Nights loaded | paged newest-first rows | R6 | direct |
| All Nights loading more | footer activity indicator | R6 loading grammar | explicit mapping |
| Night asleep recorded, staged | full detail | R4 | direct |
| Night window open/updating | close time status | R5 | direct |
| Night time-zone uncertain | approximate copy; excluded from window consistency | R4 | direct |
| Timeline stages available | hypnogram | R4 | direct |
| Timeline stage detail absent | unspecified sleep timeline + source-without-stages copy | R4 hypnogram + R5 note | explicit mapping |
| Timeline pending correction/unknown | unspecified timeline + recalculating note | R5 | direct |
| Stages available | Deep/Core/REM/Awake values | R4 | direct |
| Stages absent | not-available-from-source copy | R5 notice grammar | explicit mapping |
| Stages pending/unknown | total/timing final; stage minutes recalculate | R5 | direct |
| Continuity available | longest continuous + awake in window | R4 | direct |
| Continuity absent | source lacks required stage detail | R5 notice grammar | explicit mapping |
| Continuity pending/unknown | recalculation copy | R5 | direct |
| Time in Bed present | interval + duration | R4 | direct |
| Time in Bed absent | section omitted | R4 without section | explicit mapping |
| Additional Sleep present | episode/source/duration + combined total | R5 | direct |
| Additional Sleep absent | section omitted | R4 | direct |
| Source & Data collapsed | counted-source summary | R4 | direct |
| Source & Data expanded | corroboration, zone, window use, stage status, origin, time, algorithm | R5 | direct |
| In-bed-only night | row/detail factual absence | R6 | direct row; detail maps to state panel |
| No-sleep-recorded night | row/detail factual absence | R6 | direct row; detail maps to state panel |
| Night not found | exact no-recorded-night state | R6 state grammar | explicit mapping |
| Root/trends/sheet loading | activity indicator | R6 | direct |
| Resource unavailable | Apple Health availability copy | R6 state grammar | explicit mapping |
| Root no data | first-synced-night copy | R6 | direct |
| Failure | inline current message | R6 state grammar | explicit mapping |
| Scope range loading | progress card | R6 loading grammar | explicit mapping |
| Scope range failed | current Goal-date failure + Try again | R6 | direct |
| Scope range empty | no Evidence inside Goal dates | R6 | direct |
| Pagination cursor | load more when last row appears | R6 | mapped to same row list + spinner |

Recovery invariants: no score, target, good/bad judgment, coaching, causality or Confidence activation; `strategicUse` remains quarantined and `strategicEligible` remains false.

