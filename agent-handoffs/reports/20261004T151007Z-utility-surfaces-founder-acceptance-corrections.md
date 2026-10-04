# Utility surfaces — Founder acceptance corrections

Status: **focused corrections ready for Founder confirmation; design direction only; implementation not started**

## Authorities

- Founder correction prompt: `2b780cd80c15e0c8d057d3c9f4b9f752dd39d1b2`
- Accepted utility design package: `29d2fe1fcd343e4da077b020a120c1e2f14f37ea`
- Shipping Native authority audited: `b8ee8690b194cb90086b62816b9a2c8c400dc026` — Build 85

## Founder decision carried forward

- Apple Watch overall direction: accepted, pending this metric-identity confirmation.
- Live Activity / Dynamic Island: accepted unchanged and not rerendered.
- Training Logger overall direction: accepted, pending this Done-control confirmation.
- No other utility design was changed.
- This is design-direction work only. Shipping implementation has not started.

## Watch production icon and color audit

Build 85 source: `ios/PhysiqueOSWatch/WatchWorkoutViews.swift`.

`WatchMetricRow` assigns accent color only to the icon. Every metric retains a written label and neutral value/card treatment.

### Workout Metrics

| Metric | Exact SF Symbol | Exact Build 85 dark accent | Mineral-light contrast token |
|---|---|---:|---:|
| Time | `timer` | `#60A5FA` | `#2563B8` |
| Active Calories | `flame.fill` | `#FBBF24` | `#A85A00` |
| Total Calories | `sum` | `#4ADE80` | `#137847` |
| Heart Rate | `heart.fill` | `#FF697A` | `#C73850` |

### Daily Totals

| Metric | Exact SF Symbol | Exact Build 85 dark accent | Mineral-light contrast token |
|---|---|---:|---:|
| Training Session | `stopwatch` | `#60A5FA` | `#2563B8` |
| Active Calories / So Far | `flame.fill` | `#FBBF24` | `#A85A00` |
| Nutrition | `fork.knife` | `#C084FC` | `#7540B8` |

The mineral-light values preserve source hue identity while darkening the accents enough for legibility on mineral/paper surfaces. Identity is never color-only: exact symbol role and written metric label remain.

No Watch layout, surface, type, spacing, paging, controls, gesture, finish/save, warning, HealthKit, or authority behavior changed.

## Logger Done-control audit

Build 85 sources:

- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerView.swift`
- `ios/PhysiqueOS/Presentation/TrainingLogger/TrainingLoggerViewModel.swift`
- `ios/PhysiqueOS/Networking/TrainingSessionAuthority.swift`

Current shipping semantics:

- unchecked SF Symbol: `circle`;
- checked SF Symbol: `checkmark.circle.fill`;
- current symbol size: 21 points;
- current frame: 42×40 points in the Done column;
- checked tint: success; unchecked tint: muted;
- accessibility label: `Mark set complete` or `Mark set incomplete`;
- tap requests the explicit desired end state through `setCompletion(... completed:)`;
- authority never performs a blind toggle, so an older rendered tap cannot invert newer state;
- completed row retains subtle success tint;
- delete/remove stays a separate trailing action.

Focused design correction:

- retains production circle/checkmark-circle identity;
- uses a visible 28-point circle inside a measured 44×44 target;
- displays checked and unchecked states together;
- preserves a non-color checkmark state cue;
- keeps delete visually and spatially separate;
- applies to weighted, reps-only, bodyweight, weighted-bodyweight, timed, superset/linked, numeric-focus, and Watch-coordinated active rows;
- does not add completion controls to read-only Review or Final Confirmation.

No Logger entry, Areas, Picker, menu, Watch-ready, Finish, Cancel, Review, Final Confirmation, Workout Match, exact-correlation, records, confetti, workflow, evidence, or mutation semantics changed.

## Focused artifacts

Root:

`agent-handoffs/artifacts/utility-surfaces-acceptance-corrections-20261004/`

Watch:

- `screens/watch-metrics-dark.png`
- `screens/watch-metrics-light.png`
- `screens/watch-daily-dark.png`
- `screens/watch-daily-light.png`
- `screens/watch-metric-comparison.png`

Logger:

- `screens/logger-weighted-dark.png`
- `screens/logger-weighted-light.png`
- `screens/logger-superset-dark.png`
- `screens/logger-superset-light.png`
- `screens/logger-done-comparison.png`

Proof:

- `screens/focused-review-board.png`
- `SOURCE-CORRECTIONS.md`
- `COVERAGE-PROPAGATION.md`
- `validation.json`

## Dark/light parity

- Workout Metrics: rendered dark and mineral-light with identical geometry/content.
- Daily Totals: rendered dark and mineral-light with identical geometry/content.
- Weighted Logger rows: rendered dark and mineral-light with identical control geometry/state.
- Superset/bodyweight Logger rows: rendered dark and mineral-light with identical control geometry/state.
- Watch light accents are hue-preserving contrast adaptations; Logger semantic checked/unchecked states remain shape/text-accessible in both appearances.

## Coverage propagation

The complete utility package was not rerendered.

W2/W3 correction propagates through the shared metric-row template to:

- all present and missing Workout Metrics;
- Always-On/reduced-luminance presentations;
- fresh, stale, offline, missing, other-day-suppressed Daily Totals;
- partial-day Active Calories with `SO FAR`.

Logger correction propagates through the shared active set-row template to:

- ordinary weighted and reps-only;
- bodyweight and weighted-bodyweight;
- timed/duration;
- superset/linked;
- complete and incomplete states;
- numeric focus/keyboard and Watch-coordinated active sessions.

Read-only Review/Confirmation does not receive the control. Corrected-state uncovered count is zero. The original package matrix now carries a Founder-acceptance overlay, and the focused package includes `COVERAGE-PROPAGATION.md`.

## Accessibility

Watch:

- symbol + written label + value prevents color-only metric identity;
- dark uses exact shipping accents;
- mineral-light uses hue-preserving contrast tokens;
- missing values remain explicit `—` under the same symbol/label.

Logger:

- every corrected Done target measures 44×44 points in the harness;
- checkmark and filled/outlined geometry communicate state without color;
- labels specify set completion action semantics;
- delete remains a different icon in a separate column;
- the row remains dense while allowing Dynamic Type implementation to keep the completion target unambiguous.

## Automated validation

Focused validation passed:

- 10 expected focused render targets present; no missing/extra targets;
- no page overflow or escaped stages;
- 22 rendered Done targets measured; none below 44×44;
- required source icon roles present: `timer`, `flame.fill`, `sum`, `heart.fill`, `stopwatch`, `fork.knife`;
- Live Activity changed: false;
- shipping code changed: false.

## Backlog status

The app-wide design backlog now records:

- Live Activity accepted unchanged / ready to lock as presented;
- Watch accepted pending focused icon/color confirmation;
- Logger accepted pending focused Done-control confirmation;
- implementation not started.

## Shipping isolation

Only disposable design artifacts, coverage documentation, the report, and backlog status were updated. No shipping Native source, Server code, HealthKit behavior, ActivityKit lifecycle, Logger contract, workout authority, build number, or TestFlight state changed.
