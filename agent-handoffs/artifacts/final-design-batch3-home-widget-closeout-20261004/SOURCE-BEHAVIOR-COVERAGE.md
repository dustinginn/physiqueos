# Widget source / behavior coverage matrix

| Area | Current authority preserved | Review proof |
|---|---|---|
| Families | `systemSmall`, `systemLarge` only | exact 170 × 170 and 360 × 376 renders |
| Placeholder | canonical sample snapshot | same fresh/full-data geometry; no new loading UI |
| Snapshot | local versioned App Group file | fresh and unavailable renders |
| Timeline | now + eligible next midnight; 45-minute policy | waiting-for-today render and audit |
| Small content | Nutrition, P/C/F, Active, optional Weight | all present/no-weight states |
| Large content | Training, Nutrition, Activity, Weight | fresh + long-training + no-weight states |
| Active workout | Start changes to Resume with current progress | active-workout state in both families |
| Freshness | fresh, aging, stale/offline | fresh and stale/offline; aging shares fresh geometry |
| Failure | previous values freeze offline; no prior read is unavailable | stale/offline and unavailable states |
| Day boundary | prior-day totals hidden | waiting-for-today states |
| Privacy | sensitive totals/rows/progress redact | privacy-redacted states |
| Refresh | current independent refresh action | retained in every state |
| Deep links | small whole-widget workout; large domain rows + workout | exact current action map |
| Storage safety | atomic, protected, authority/account fenced | source audit; no design expansion |
| Dark | locked navy/teal/semantic color fields | all 16 dark screens |
| Mineral Light | mineral surface, deep-teal action, same content/geometry | all 16 light screens |

Rendered matrix: `boards/widget-source-behavior-matrix-mobile.png`.
