# PhysiqueOS Apple Watch Workout V1 mockups

These are product/architecture review artifacts, not shipping Watch code.

- `watch-workout-v1-board.svg` shows the required twelve V1 states at a 45 mm Watch reference scale: Start, normal set, final-set transition, final workout, Crown metrics, swipe-left controls plus finish confirmation, paused, Countdown, offline, stale/conflict, supersets, and single-set exercises.
- The execution view deliberately keeps one dominant action and a large timer/load treatment. The metrics surface is the next vertical page; the controls surface is reached by a horizontal swipe.
- “Total calories” is shown unavailable when basal energy cannot be established; active energy is never mislabeled as total.
- Offline and stale states fail closed for structured set mutations. A Watch-owned HealthKit workout may continue while the structured logger waits for phone authority.
- The revised board uses the shipping PhysiqueOS palette: near-black navy `#080D18`, elevated navy surfaces, purple `#8B8CFF` actions/progress, and the existing semantic success/evidence/effort/danger accents. It intentionally avoids Apple Workout's green/orange primary-action aesthetic.

## Locked Watch tokens

- Background: `#080D18`; raised/card surface: `#141F31`; secondary raised surface: `#172235`; subdued/disabled surface: `#20264A`.
- Primary action/progress: `#8B8CFF`; primary text: `#F4F6FF`; secondary text: `#9AA4BA`.
- Semantic-only accents: success `#62D49A`, warning `#F2B84B`, error `#FF6B7A`, heart rate `#FF6B7A`, stale/disabled `#667085`.
- Purple remains the dominant brand/action color. Green, amber, and red communicate state only; they are never the general workout identity.
