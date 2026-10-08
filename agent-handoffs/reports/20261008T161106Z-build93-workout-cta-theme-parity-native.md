# Build 93 — workout primary-button colour continuity + Mineral Light Live Activity (Native candidate)

- Generated (UTC): 2026-10-08T16:11:06Z
- Agent: Claude (Claude B conversation, single Remote Control worktree)
- Task: `build93-claude-watch-live-activity-theme-20261008` (GitHub staged task `364636a8`)
- Candidate branch: `claude/native-build93-workout-cta-theme-parity-20261008`
  - final `741d3562` (artifacts only)
  - code `d7d915a6`
  - base: Build 92 `beaf5eff`, exactly
- Version: still 1.0 (92). No bump, no archive, no TestFlight, no deploy, no Server change.
- No Recovery code is mixed in. The held Codex Energy `1bb88fb5` was not merged.

## 1. Result

Every primary workout action now uses the existing iPhone **Finish Workout** amber, in both Dark and Mineral Light:
- iPhone (unchanged);
- Watch: Complete Set, Finish Workout, and the Finish confirmation;
- Live Activity: Complete Set.

The Live Activity gains a proper Mineral Light appearance. It follows the user's selected PhysiqueOS theme (System, Dark or Mineral Light), not just the iOS appearance.

## 2. Exact source tokens (unchanged values)

| Role | Dark | Mineral Light | Source |
|---|---|---|---|
| Primary action fill | `#EFB84F` | `#C88228` | `PhysiqueOSTheme.redesignAmber` (iPhone Finish Workout) |
| Primary action label | `#10202A` | `#10202A` | `PhysiqueOSTheme.redesignOnExecution` |

- The values now live in one place: `WorkoutPrimaryActionToken`, in `Contracts/WatchWorkoutContracts.swift`. That file is compiled into both the app and the Watch target.
- `redesignAmber` and `redesignOnExecution` now read from the token, so the iPhone pixels are identical.
- The Live Activity extension cannot import app code. It keeps a mirrored copy (`WorkoutActivityPrimaryAction`), and a unit test asserts the copies are equal.
- Label contrast on the fill is at least 4.5:1 in both appearances (tested).

## 3. Scope (16 files, +473 / −51)

**Shared token**
- `WatchWorkoutContracts.swift`: adds `WorkoutPrimaryActionToken`.
- `PhysiqueOSTheme.swift`: the amber now references the token.

**Watch**
- `WatchWorkoutViews.swift`: `WatchPalette.workoutPrimary` / `onWorkoutPrimary`, with dark and Mineral Light variants.
- `WatchEdgeCapsuleButton` defaults to these colours, covering Complete Set, Finish Workout and Finish confirm.
- `.warning` action ink uses `onWorkoutPrimary`.
- Purple remains for CURRENT and navigation chrome, as in Build 92.

**ActivityKit contract**
- `WorkoutActivityAttributes.ContentState` gains `appearance: Appearance?` (`system` / `dark` / `mineralLight`).
- The field is optional and omitted when nil. Unknown values decode to `.system`, so older and newer app or extension pairs keep decoding.

**Live Activity views**
- `WorkoutActivityTheme` adds a full Mineral Light palette:
  - mineral page `#E8ECE5`;
  - paper rows `#FBFAF4`;
  - ink `#102431`;
  - amber-ink accent `#925500`;
  - green `#16875F`;
  - purple `#5C3FD2`.
- Complete Set uses the CTA token. Role labels, the superset chip and the keyline use amber, replacing the earlier teal.
- `resolve(appearance, system:)` picks the palette. Background tint and system action foreground follow the appearance.

**Theme propagation (app)**
- `WorkoutActivityContentMapper.withAppearance` maps `AppAppearance` to the activity appearance (light → mineralLight).
- `WorkoutLiveActivityCoordinator` / `Bridge` stamp every state with the current appearance, including the saved end state. `appearanceDidChange()` pushes a restyle.
- `PhysiqueOSApp` wires the provider in and adds `.onChange(of: appearance.selection)`.

**Project generator**
- `generate_project.py` places the new test file in a pinned ID block, `0x21FF`. Nothing is renumbered, and the pbxproj changes by 4 lines.
- The generator is deterministic: a re-run gives no diff.

Workout logic, the authority/draft store, the Watch command protocol and haptics are untouched. Only colours and the appearance stamp change.

## 4. Tests (serialized with Codex; Mac shared)

| Gate | Result |
|---|---|
| Focused iPhone (theme + Live Activity + coordinator) | 86 passed, 0 failed |
| Full iPhone unit (`PhysiqueOSTests`) | **2,234 passed, 0 failed**, 1 skipped |
| Watch unit (`PhysiqueOSWatchTests`) | **76 passed, 0 failed** |
| `WatchPrimaryActionThemeUITests` | passed on 42 mm and 49 mm |
| Release build, iOS Simulator, unsigned | succeeded; app embeds the Live Activity extension + Watch app |
| `verify_release_configuration.py` | verified 1.0 (92) |
| Seam scan | extension contains `mineralLight`; 0 Recovery strings in app |

New tests:
- `WorkoutPrimaryActionThemeTests` (10 tests):
  - token values unchanged and copies equal;
  - contrast;
  - no teal;
  - resolve and tint;
  - AppAppearance mapping;
  - JSON back-compat (nil omitted; unknown → system);
  - significant-key behaviour;
  - coordinator stamping, restyle on theme change, and restamping an older activity.
- Lock Screen render test: the app theme overrides the system theme.
- Watch unit: primary action colour per appearance.
- Watch UI capture class.

**Known failure, pre-existing and not caused by this change:** `WatchWorkoutNavigationUITests.testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`. The fixture harness has no WCSession, which is already listed in the Build 92 backlog. Its sibling in the new class drives the same fixture and confirmation and passes.

The full unit run rewrites tracked widget PNGs under `home-screen-widget-v1`. They were restored with `git checkout` and are not part of this candidate.

## 5. Screenshots (code acceptance; synthetic fixtures)

Captures are on the candidate branch in folder `agent-handoffs/artifacts/build93-workout-cta-theme-parity` (README included).

- **Watch, 12 PNGs:** real watchOS Simulator screenshots of the shipping SwiftUI, via the DEBUG fixture harness.
  - Fixtures: Complete Set, Finish Workout and Finish confirmation.
  - Each in Dark and Mineral Light, on 42 mm and 49 mm.
- **Live Activity, 10 PNGs:** the shipping Live Activity views **rendered off-ActivityKit** by unit tests. These are not system Lock Screen screenshots.
  - Lock Screen A / C / F in Dark and Mineral Light.
  - App Mineral Light on iOS Dark, and the reverse.
  - Dynamic Island (always dark).

Nothing has been verified on a device. Physical acceptance happens after integration and a build.

## 6. Theme propagation limits (platform)

- A Live Activity cannot restyle itself; it changes only when it receives an update.
  - When the theme changes in the app (so the app is foregrounded), the app pushes an update immediately.
  - An activity started by an older build has no `appearance` field. It follows iOS (`.system`) until the next state sync restamps it.
- **System** selection follows the iOS Light/Dark setting on the Lock Screen. **Dark** and **Mineral Light** override it.
- The Dynamic Island and StandBy dark rendering are always system black. They use the dark palette with the amber CTA, by Apple design.
- The **Watch** keeps its own independent appearance setting (Build 89 design). It was not coupled to the phone theme in this candidate. Both Watch appearances use the matching token.

## 7. Overlap with other Build 93 candidates (trial merges with `git merge-tree`)

- **Codex Home/Priority/Morning Native** `89378f31` (on Build 92): no shared files; merges cleanly.
- **Codex Energy Native** `1bb88fb5`: no shared files. It is still **held** and was not merged.
- **Claude Recovery Native** `e0a4706d`:
  - The two candidates share only `ios/Scripts/generate_project.py` and the pbxproj. The trial merge conflicts in both.
  - Resolution:
    1. keep both test-file lists and both pinned blocks (`0x20FF` Recovery, `0x21FF` theme);
    2. take either pbxproj;
    3. re-run the generator and check that a re-run is clean.
  - Recovery itself remains on Founder HOLD (audit main `7ad6ddef`).

## 8. Disk safety

- Free space ranged from about 15 to 17 GiB during the work and stayed above the 12 GiB stop floor.
- Heavy runs were serialized.
- After capture, the lane cleanup removes only this lane's regenerable artifacts: its two DerivedData folders in the job tmp, and the three lane simulators (iPhone 17 Pro "B93 Theme", Watch 42 mm, Watch 49 mm).
- Archives 85–92, other simulators and worktrees, credentials and Founder data are untouched.

## 9. Next step

Combined Build 93 Native integration, by Codex or the Founder:
1. Start from Build 92.
2. Merge this candidate and the Codex Home candidate.
3. Add Recovery only after the Founder lifts the HOLD.
4. Resolve the generator as in section 7.
5. Run the full gates.
6. Bump to 93 and archive.

Then accept on a device: start a workout with the app in Mineral Light and check the Lock Screen; switch the theme mid-workout; check the Watch Complete Set and Finish in both appearances.
