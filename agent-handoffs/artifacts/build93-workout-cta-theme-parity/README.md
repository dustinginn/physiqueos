# Build 93 — workout primary CTA continuity: code-acceptance captures

Source: Native candidate `claude/native-build93-workout-cta-theme-parity-20261008` (code commit `d7d915a6`, based on Build 92 `beaf5eff`; build 1.0 (92) unchanged). No real workout or Founder data.

## Watch (`watch/`)

Real watchOS 27 Simulator screenshots of the shipping SwiftUI. Data comes from the DEBUG fixture harness (`-watchFixture`, `-watchAppearance`), on both Watch sizes:
- `*-small`: Series 11, 42 mm;
- `*-large`: Ultra 4, 49 mm.

Each fixture is captured in Dark and Mineral Light:
- `normal`: Complete Set;
- `final-workout`: Finish Workout;
- `finish-confirmation`: Finish.

## Live Activity (`live-activity/`)

These are the **shipping Live Activity SwiftUI views rendered off-ActivityKit** by the app's unit tests (`WorkoutLiveActivityViewTests`) in a synthetic Lock Screen scene. They are **not** system Lock Screen screenshots, and nothing was verified on a device. Synthetic fixture states only. Images are downscaled.

- `A-*`: previous + current, rest stopwatch.
- `C-*`: final set + up next.
- `F-*`: superset.
- `-mineral` suffix: Mineral Light.
- `theme-mineral-light-app-on-dark-ios`: the app is set to Mineral Light while iOS is Dark; the Lock Screen follows the app.
- `theme-dark-app-on-light-ios`: the reverse case.
- `G-island-*`, `theme-island-*`: the Dynamic Island stays system black.

Primary action in every surface: iPhone Finish Workout amber — Dark `#EFB84F`, Mineral Light `#C88228`, label `#10202A`.
