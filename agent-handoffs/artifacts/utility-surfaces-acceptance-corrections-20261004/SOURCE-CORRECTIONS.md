# Source-authoritative corrections

## Watch production metric identity

Source: Build 85 `ios/PhysiqueOSWatch/WatchWorkoutViews.swift` at `b8ee8690b194cb90086b62816b9a2c8c400dc026`.

`WatchMetricRow` applies the accent only to the icon; the label/value and shared card surface remain neutral. That rule is preserved.

### Workout Metrics

| Metric | Exact SF Symbol | Exact production dark accent | Mineral-light review token |
|---|---|---:|---:|
| Time | `timer` | `timeAccent` = `#60A5FA` | `#2563B8` |
| Active Calories | `flame.fill` | `activeEnergyAccent` = `#FBBF24` | `#A85A00` |
| Total Calories | `sum` | `totalEnergyAccent` = `#4ADE80` | `#137847` |
| Heart Rate | `heart.fill` | `heartRateAccent` = destructive = `#FF697A` | `#C73850` |

### Daily Totals

| Metric | Exact SF Symbol | Exact production dark accent | Mineral-light review token |
|---|---|---:|---:|
| Training Session | `stopwatch` | `timeAccent` = `#60A5FA` | `#2563B8` |
| Active Calories / So Far | `flame.fill` | `activeEnergyAccent` = `#FBBF24` | `#A85A00` |
| Nutrition | `fork.knife` | `nutritionAccent` = `#C084FC` | `#7540B8` |

The light tokens preserve each semantic hue while darkening it enough to remain legible on mineral/paper surfaces. Metric identity never depends on hue alone: the SF Symbol and written metric label are always present. Missing values continue to render as `—` under the same icon/label. Fresh/stale/offline text does not change icon identity.

## Logger production Done control

Source: Build 85 `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift` and `TrainingLoggerViewModel.swift`.

Current shipping control:

- header label: `Done`, 42-point column;
- unchecked symbol: `circle`;
- checked symbol: `checkmark.circle.fill`;
- symbol size: 21 points;
- source target frame: 42×40 points;
- checked tint: `PhysiqueOSTheme.chartSuccess`;
- unchecked tint: `PhysiqueOSTheme.textMuted`;
- accessibility label: `Mark set complete` / `Mark set incomplete`;
- tap requests an explicit end state through `setCompletion(... completed:)`, never a blind toggle;
- completed rows retain the subtle success background;
- remove remains a separate trailing trash control.

Focused design translation:

- preserves circle/checkmark-circle identity and explicit state;
- expands the interactive target to 44×44 points;
- uses a 28-point visible circle so the control remains obvious in dense rows;
- preserves success/neutral semantics plus a visible checkmark, so state is not color-only;
- keeps the separate delete target and column;
- raises row height only from shipping 42 points to 52 points in the visual proposal, enough to contain the target without turning the dense set table into oversized cards;
- applies identically to ordinary weighted, bodyweight, weighted-bodyweight, timed, and superset/linked active set rows;
- does not add a Done control to read-only Review or Final Confirmation.

The render harness uses platform-neutral vector stand-ins for the documented SF Symbols. Shipping implementation would continue using the exact SF Symbol names above.
