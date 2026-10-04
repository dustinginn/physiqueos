# Weight coverage matrix

Every Build 85 state is either directly rendered or mapped to a visually equivalent template. Uncovered states: **0**.

| Current state / section | Contract behavior | Template | Coverage |
|---|---|---|---|
| Root loaded/header/scope | one page; Goal/phase range filters all sections | W1 | direct |
| Build Lean Mass summary | Latest / Since Start / Highest / Lowest | W1 summary component | exact component mapping documented |
| Visible Abs summary | Latest / Since Start / Last Change / Lowest | W1 | direct |
| All Weight summary | Latest / Since First / Highest / Lowest | W1 summary component | exact component mapping documented |
| Weight Trend | exact points, tight y-domain, selected/latest tooltip | W1 | direct |
| DEXA markers | purple dashed full-height rules + top dot | W1 | direct |
| Sparse trend | fewer than two points → `More history needed` | W2 | direct |
| Rolling 3-day/7-day available | server-resolved average + observation count | W1 | direct |
| Rolling window pending | `Pending`, observation count retained | W2 | direct |
| Rolling averages absent in Sandbox | section omitted | W1 without section | explicit mapping |
| Weekly Averages collapsed | three newest rows | W1 | direct representative row |
| Weekly Averages expanded | all rows, same component; Close action | W1 | direct component mapping |
| Weekly Averages empty | more-history-needed copy | W2 empty panel grammar | explicit mapping |
| Weight History collapsed | three newest rows | W1 | direct representative row |
| Weight History expanded | all rows, same component; Close action | W1 | direct component mapping |
| Weight History empty | canonical empty copy | W2 | direct |
| Default/non-default conditions | row metadata retained | W1 row grammar | direct default; non-default maps to same row |
| Loading | centered activity indicator | W2 | direct |
| Failure | inline current message | W2 | direct |
| Refresh / foreground reload | content structure unchanged | W1 | mapped |
| Detail/history route | **does not exist** | W2 note | audited absence; no invented route |
| Streak/Related Goals | removed/non-current | none | correctly absent |
| Provider/future source UI | read model has fixture source values but view does not render them | none | correctly absent |

Semantic invariants: Goal lookup behavior is unchanged; `Highest` remains Build Lean Mass behavior; `Lowest` remains Visible Abs behavior; no new moving average, date range or DEXA interpretation.

