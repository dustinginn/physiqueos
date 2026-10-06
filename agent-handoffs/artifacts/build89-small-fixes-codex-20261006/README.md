# Build 89 small-fixes review package

This package contains compact review boards captured from shipping PhysiqueOS views on the dedicated `Codex Build89 iPhone 17 Pro` simulator. C1–C3 include Dark and Mineral appearances; C4 uses the shipping widget render.

## Boards

- `boards/C1-training-detail-pr-card.png` — canonical exact-session performance records immediately below Workout Summary.
- `boards/C2-nutrition-calories-green.png` — Calories uses semantic green without changing the other macro colors.
- `boards/C3-home-timeline-copy.png` — approved headline and compact Remaining copy; phase detail remains unchanged.
- `boards/C4-widget-refresh-accent.png` — refresh uses the same teal/cyan action authority as Start Logger.
- `boards/C5-logger-suggested-selection.png` — Suggested Today’s explicit target transitions to the selected checkmark while its Training Area tile stays synchronized.
- `boards/C6-logger-set-typography-options.png` — Founder checkpoint comparing Current with restrained A/B/C numeric typography options in Mineral, plus a compact Dark verification strip. No shipping typography selection has been made.
- `live-activity-stopwatch-integration.md` — exact state-specific post-merge correction for Claude A’s redesigned Live Activity; no Build 88 implementation was recreated.

## Capture provenance

- C1 and C2: focused `TrainingAcceptanceUITests` against the real sandbox navigation and shipping screens.
- C3: existing `FoamRollingPriorityDetailUITests` physical-parity journeys against the shipping Home screen.
- C4: `HomeWidgetTests.testShippingViewsRenderAllRequiredStates` against `HomeLoggedTodayWidgetView`.
- C5: focused real-SwiftUI component renders plus canonical `TrainingLoggerViewModel` selection tests.
- C6: real `NumericEditField` SwiftUI rows rendered from one fixed Logger state and unchanged column geometry; representative values include `102.5` and `1250`.

Raw screenshots live in `captures/`. The scripts in `source/` deterministically compose the boards without altering app code or runtime behavior.
