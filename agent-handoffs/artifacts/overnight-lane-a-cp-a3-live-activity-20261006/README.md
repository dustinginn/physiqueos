# Overnight Lane A — Checkpoint A3: Live Activity + Dynamic Island

**Status: ready for Founder review (not accepted).**

- **Code commits:** `461b3651`, plus the A6 regression fix `3d112478` on `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Base:** Build 88 `7fce3b97`.
- **Visual authority:** Founder-locked "as presented, no changes" (P:20261004T150500Z / T160500Z).
  - Design package `29d2fe1f`, boards LA1–LA9, both dark and light.
  - The rendered board was measured with Chrome and is the authority. Its CSS source says purple, but the rendered board shows teal current/action.

## Boards (phone-width PNGs)

- `boards/la-dark.png`: Lock Screen, Dark. Covers the 12 states listed below.
- `boards/la-mineral.png`: Lock Screen, Mineral Light. Same 12 states.
- `boards/la-island.png`: Dynamic Island expanded, compact and minimal.

The 12 Lock Screen states are:
- active, countdown, final set, post-final, Rest Off, superset, long names;
- all sets complete, saving, saved, needs-update, privacy.

**Rendering path:** the shipping SwiftUI is the same source the Widget Extension compiles. `WorkoutLiveActivityViewTests` renders it on the 365 pt card used for the approved prototype, with the system chrome as a test backdrop.

## Translation

| Area | Change |
|---|---|
| Lock Screen tokens | Dark is `#061019` page, `#132735` rows, teal `#3BD2CA` role labels and Complete Set (label `#061019`), green `#55E39A` rest glyph, amber `#EFB84F` needs-update, purple `#AA98FF` saving/reviewing. |
| Mineral Light tokens | `#E8ECE5` page, `#FBFAF4` rows, teal `#087E78` with a white label, `#16875F`, `#C88228`, `#5C3FD2`, ink `#102431`. |
| Appearance rule | The Lock Screen follows the **iPhone system appearance** (ActivityKit's own rule). It follows neither the app's iPhone setting nor the Watch preference, as the addendum requires. |
| Activity tint | Static navy tint; the Lock Screen draws its own page (navy or mineral) from the system appearance. |
| Dynamic Island | System black in both appearances, always on the Dark tokens. |
| Typography | **SF system faces** (changed in A6; see below). |
| Header (20 pt) | Glyph, session label, "6/18 sets", elapsed time, all 11 pt / 650. |
| Rows | 31 pt rows, 9 pt radius, 57 pt role column at 7 pt / 780 with tracking, 11 pt / 700 name. "n/m · value" at 9 pt. |
| Clock block | Green glyph, 7 pt label, 20 pt / 700 value. |
| Complete Set | 124×44, 13 pt radius, explicit checkmark, "Complete Set" at 11 pt / 760. |
| Lifecycle states (LA5–LA8) | A 44 pt tinted glyph circle, 16 pt title, 11 pt reason and the frozen clock. The separate "Open Logger" pill was removed to match the board; the whole activity still deep-links to the Logger. |
| Privacy (LA9) | Names, values and Complete Set are removed. Progress, a "Set details hidden" row and the generic **workout** clock remain. |
| Island | Two cards at teal 12.5%, plus the clock block and Complete Set. The final set's current card is amber and marked CURRENT · FINAL; a completed card is green. Compact: white glyph, green rest dot plus clock. Minimal: green ring at 33% plus glyph. |

## Preserved (unchanged)

- `WorkoutActivityAttributes` / `ContentState` (schema).
- `WorkoutActivityPresentation`: privacy, the staleness safe state, and the countdown-at-zero exception.
- The `CompleteWorkoutSetIntent` target and revision.
- The date-based timers (no per-second updates).
- The deep link `physiqueos-workout://open?session=` (`widgetURL`).
- Accessibility labels and hints.
- The coordinator, bridge and client are untouched.

## Deviations

1. **Height budget.** Live Activities truncate above 160 pt. The board's frame was 190 pt, with 175 pt of content. All board sizes are kept; only the vertical padding (8 pt) and the header line (20 pt) were trimmed. Every state is at or under 160 pt by test.
2. **Set position kept on every row.** The board's current row shows only the value. Shipping shows "3/4 · 85 lb × 8" on every row, the board's own up-next format, so the set number is never lost.
3. **Island cards.** 64 pt minimum height, versus 70 pt on the board.
4. **Compact trailing.** The rest dot is green and the clock text white (the board renders both white).

## Tests

**Live Activity suites: 37/37 pass** (`WorkoutLiveActivityViewTests`, `WorkoutLiveActivityIntentTests`, `WorkoutLiveActivityContractTests`). New in `WorkoutLiveActivityViewTests`:
- Every Lock Screen state is checked in **both** appearances against the 160 pt budget, with non-blank renders.
- A theme test: Dark/Light map to the locked tokens, and the Island stays Dark even in a light environment.
- Privacy and needs-update renders in Mineral.

## A6 regression fix (`3d112478`): the Live Activity extension crash

The integrated UI gate found that the first A3 build **crashed the PhysiqueOSLiveActivity extension** when a real Live Activity rendered.

- **Crash:** `EXC_BREAKPOINT`, `KEY_TYPE_OF_DICTIONARY_VIOLATES_HASHABLE_REQUIREMENTS` in SwiftUI's `CodableAttributedString` display-list encoder. ActivityKit archives the view, and it cannot archive:
  - a `UIFont` built from the variable Jakarta font descriptor;
  - `UIColor`-backed `Color`s.
- **Fix:**
  - Live Activity type now uses SF system faces with the same sizes and weights. The utility package allows SF "where Apple owns the surface".
  - Every Live Activity color is a plain sRGB `Color`.
  - The Mineral Lock Screen page is drawn by the view instead of a dynamic tint.
  - Jakarta was removed from the extension target, so generator block `0x1EFF` is Watch-only again (4 pbxproj lines).
- **Verified:**
  - `LoggerParityCaptureUITests` CP4 Review / Finish / Complete, plus the 8 Logger journeys that cascaded from it, pass on a freshly erased simulator.
  - No new extension crash reports.
  - The boards above are re-rendered with the fix.
- **Deviation:** the board uses Jakarta, and the shipping Live Activity uses SF. This is a platform constraint.
