# Utility surfaces — focused Founder acceptance corrections

Status: **ready for Founder confirmation; design direction only; implementation not started**

This package contains only the two requested corrections over accepted utility package `29d2fe1fcd343e4da077b020a120c1e2f14f37ea`:

1. Watch Workout Metrics and Daily Totals restore Build 85’s exact production metric icon roles and per-metric color identity.
2. Logger active set rows restore the obvious production-style Done checkmark-circle at a practical 44×44 point target.

Live Activity / Dynamic Island is accepted unchanged and was not rerendered.

## Focused review renders

### Watch

- [Workout Metrics — dark](screens/watch-metrics-dark.png)
- [Workout Metrics — mineral light](screens/watch-metrics-light.png)
- [Daily Totals — dark](screens/watch-daily-dark.png)
- [Daily Totals — mineral light](screens/watch-daily-light.png)
- [Before / after metric identity](screens/watch-metric-comparison.png)

### Logger

- [Weighted rows — dark](screens/logger-weighted-dark.png)
- [Weighted rows — mineral light](screens/logger-weighted-light.png)
- [Superset/bodyweight rows — dark](screens/logger-superset-dark.png)
- [Superset/bodyweight rows — mineral light](screens/logger-superset-light.png)
- [Before / after Done control](screens/logger-done-comparison.png)

### Supporting proof

- [Focused review board](screens/focused-review-board.png)
- [Source correction audit](SOURCE-CORRECTIONS.md)
- [Coverage propagation](COVERAGE-PROPAGATION.md)
- [Automated validation](validation.json)

## Authorities

- Founder correction prompt: `2b780cd80c15e0c8d057d3c9f4b9f752dd39d1b2`
- Accepted utility package: `29d2fe1fcd343e4da077b020a120c1e2f14f37ea`
- Shipping Native audit authority: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85

No shipping Native, Server, Watch behavior, Logger workflow, HealthKit, ActivityKit, evidence, authority, build, or TestFlight state changed.
