# Interaction and Disclosure Matrix

Navigation/disclosure parity is part of this correction contract. Every focused or adjacent affordance audited in Build 85 is accounted for below.

| Surface | Affordance | Build 85 behavior | Focused template | Preserved target |
|---|---|---|---|---|
| Energy root | Weekly History → Show All | Presents `EnergyWeeklyHistorySheet` | E1 → E2 | Separate modal sheet containing weekly rows only |
| Energy root | Recent Daily Energy → Show All | Presents `EnergyDailyHistorySheet` | E1 → E3 | Separate modal sheet containing daily rows only |
| Daily Energy row | Nutrition Day | Navigates to Nutrition Evidence when calorie intake exists | E3 | Conditional link remains visible only with nutrition evidence |
| Daily Energy row | Activity | Navigates to Activity Evidence when active calories exist | E3 | Conditional link remains visible only with activity evidence |
| Weight root | Weekly Averages → Show All | Toggles its local disclosure inline | W1 → W2 | Same root; all weekly rows replace preview; action becomes Close |
| Weight root | Weekly Averages → Close | Toggles its local disclosure inline | W2 → W1 | Same root; returns to three-row preview |
| Weight root | Weight History → Show All | Toggles its local disclosure inline | W1 → W3 | Same root; all weigh-ins replace preview; action becomes Close |
| Weight root | Weight History → Close | Toggles its local disclosure inline | W3 → W1 | Same root; returns to three-row preview |
| Recovery root | Last Night / Final Night | Pushes Night Detail | Existing accepted root → R1 | Preserved |
| Recovery root | See trends | Pushes Sleep Trends | Existing accepted root → R2 | Preserved |
| Recovery root | Select chart night, then Open night | Pushes selected Night Detail | Existing accepted root → R1 family | Preserved |
| Recovery root | Recent Nights → Show All | Presents paged All Nights sheet | Existing accepted root | Preserved |
| Recovery root | Recent night row | Pushes Night Detail | Existing accepted root → R1 family | Preserved |
| Recovery trends | Range pills | Reloads the selected canonical range | R2 | Preserved; 1M shown |
| Recovery trends | Stage Mix | Expands/collapses inline | R2 | Preserved; collapsed state shown |
| Recovery trends | All Nights → Show All | Presents paged All Nights sheet | Existing accepted trends | Preserved |
| Recovery All Nights | Night row | Pushes Night Detail inside the sheet navigation stack | Existing accepted All Nights | Preserved |
| Recovery Night Detail | Timeline touch/drag | Inspects a stage without navigation | R1 | Preserved; contained plot geometry fixes clipping only |
| Recovery Night Detail | Source & Data | Expands/collapses provenance inline | Existing accepted Night Detail | Preserved |
| Energy/Weight/Recovery | Back | Returns to the labeled parent | E1, W1–W3, R1–R2 | Preserved |
| Energy/Recovery sheets | Dismiss/Done | Dismisses modal history surface | E2–E3 / existing All Nights | Preserved |

No dead destination, invented day route, editable history row, Recovery Score or strategic Recovery activation is introduced.
