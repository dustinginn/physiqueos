# Workout Logger Live Activity visual prototype (NON-SHIPPING)

This is a deterministic SwiftUI visual-review harness. It does not compile into
PhysiqueOS, import ActivityKit, create a Widget Extension, register an App ID,
change signing, read workout data, or perform workout mutations. Every value is
synthetic.

The harness renders native SwiftUI typography and SF Symbols into PNGs while
holding the Lock Screen activity card to 365 × 160 pt and the Dynamic Island
mockups to the documented 393-wide-device budgets. These are spatial mockups,
not WidgetKit/ActivityKit previews; final extension implementation still needs
Simulator and physical-device verification.

Founder revision 1 is locked into the presentation projection:

- normal: Previous + Current;
- final set: Current + Up Next (Previous drops away);
- immediately post-final: Completed + Up Next;
- never more than two full context rows.

The accepted Lock Screen direction is the large lower-left rest clock with a
trailing 44 pt Complete Set action. The current review set is emitted under
`screenshots/revision-1/`; first-pass screenshots remain as historical context.

## Regenerate

From this directory:

```sh
env SWIFT_MODULECACHE_PATH=/tmp/physiqueos-workout-live-swift-cache \
  CLANG_MODULE_CACHE_PATH=/tmp/physiqueos-workout-live-clang-cache \
  swift test --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-build

env SWIFT_MODULECACHE_PATH=/tmp/physiqueos-workout-live-swift-cache \
  CLANG_MODULE_CACHE_PATH=/tmp/physiqueos-workout-live-clang-cache \
  swift run --disable-sandbox --scratch-path /tmp/physiqueos-workout-live-build \
  workout-live-activity-render screenshots
```

The renderer emits the Founder-review set, density comparison, Complete Set
placement comparison, all fixture states, long-content pressure, and safe stale
state. A tap target in a static PNG is illustrative only: no intent executes.
