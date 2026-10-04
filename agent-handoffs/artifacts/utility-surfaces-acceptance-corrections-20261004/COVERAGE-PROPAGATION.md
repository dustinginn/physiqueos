# Focused correction coverage propagation

No complete utility rerender was performed. This matrix proves where the two accepted template corrections propagate.

## Watch W2 / W3

| Existing state | Corrected template | Propagation proof |
|---|---|---|
| Workout Metrics, all values present | W2 `WatchMetricRow` | Dark/light W2 renders |
| Time missing | W2 `timer` row | Same icon/label; value becomes `—` |
| Active Calories missing | W2 `flame.fill` row | Same amber identity; value becomes `—` |
| Total Calories missing | W2 `sum` row | Same green identity; value becomes `—` |
| Heart Rate acquiring/missing | W2 `heart.fill` row | Same pink identity; value becomes `—` |
| Always-On/reduced luminance | W2 | Same icons/colors; existing cadence/luminance behavior |
| Daily Totals fresh | W3 `WatchMetricRow` + freshness | Dark/light W3 renders |
| Daily Totals stale | W3 | Metric identity unchanged; freshness becomes `As of …` |
| Daily Totals offline | W3 | Metric identity unchanged; freshness becomes `Offline · as of …` |
| Daily Totals partial-day activity | W3 active calories | `flame.fill`, amber, and `SO FAR` caption remain |
| Daily Totals missing | W3 | Same icons/labels; missing value becomes `—` |
| Other-day snapshot suppressed | W3 | Same icons/labels; values suppressed per current presentation rules |

## Logger active set rows

| Existing active set-entry state | Corrected template | Propagation proof |
|---|---|---|
| Ordinary weighted | Logger set row | Weighted dark/light renders |
| Reps-only | Logger set row | Same Done column; load remains optional |
| Bodyweight | Logger set row | Superset/bodyweight dark/light renders |
| Weighted bodyweight | Logger set row | Same Done control; load field carries modifier |
| Timed/duration | Logger set row | Same Done control; primary field/header becomes Seconds |
| Superset/linked | Logger set row inside relationship card | Superset dark/light renders |
| Incomplete | Unchecked `circle` | Weighted and superset renders |
| Completed | Filled checkmark circle + success row tint | Weighted and superset renders |
| Numeric field focused/keyboard visible | Same active set row | Done target remains 44×44; focus behavior unchanged |
| Phone edits while Watch active | Same active set row | Authority semantics unchanged |
| Read-only Workout Review | Review summary line | No Done control added |
| Final Confirmation | Confirmation summary | No Done control added |

## Result

- Watch corrected states uncovered: **0**
- Logger applicable active set-row states uncovered: **0**
- Live Activity changes: **0**
- Other accepted utility surfaces changed: **0**
