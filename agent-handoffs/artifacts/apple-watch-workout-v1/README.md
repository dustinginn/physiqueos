# PhysiqueOS Apple Watch Workout V1 mockups

These are product/architecture review artifacts, not shipping Watch code.

- `watch-workout-v1-board.svg` shows the required twelve V1 states at a 45 mm Watch reference scale: Start, normal set, final-set transition, final workout, Crown metrics, swipe-left controls plus finish confirmation, paused, Countdown, offline, stale/conflict, supersets, and single-set exercises.
- The execution view deliberately keeps one dominant action and a large timer/load treatment. The metrics surface is the next vertical page; the controls surface is reached by a horizontal swipe.
- “Total calories” is shown unavailable when basal energy cannot be established; active energy is never mislabeled as total.
- Offline and stale states fail closed for structured set mutations. A Watch-owned HealthKit workout may continue while the structured logger waits for phone authority.
