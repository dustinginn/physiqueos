# Overnight Lane A — Checkpoints A1 + A2: Apple Watch

**Status: FOUNDER VISUAL APPROVED, pending integrated-build physical-device acceptance.**

The Founder approved the lane (2026-10-06) except the Mineral clock band. **Option A, the compact clock capsule**, was selected (prompt `3afd3f57`) and is now the only Mineral clock treatment, implemented in `7932f963`.
The overnight continuation was authorized; continuing past this checkpoint does not mean it was accepted.

- **Lane branch:** `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Base:** Build 88 `7fce3b97`.
- **Code commit for this checkpoint:** `cb64e771`. The package commit sits on top of it.
- **Visual authority:**
  - utility design `29d2fe1f`;
  - acceptance corrections `5b47063b` (branch `codex/utility-surfaces-design` @ `ca088e80`);
  - addendum `6cc07624`: independent Watch appearance.
- **Review device:** Apple Watch Ultra 3 simulator, 211×257 pt (the Founder's Watch). The locked board is drawn at 205×251 pt, so the Ultra 3 is 6 pt larger in each dimension.

## Review boards (phone-width PNGs)

| Board | Dark | Mineral Light |
|---|---|---|
| **Final Mineral clock (Option A)** | — | `boards/mineral-clock-final.png` |
| A1: handoff, execution, variants, Crown pages | `boards/a1-dark.png` | `boards/a1-mineral.png` |
| A2: controls, confirmations, saving, summary | `boards/a2-dark.png` | `boards/a2-mineral.png` |
| Before / after (Build 88 → Lane A) | `boards/before-after.png` | — |
| Smallest case (42 mm) | `boards/fit-42mm.png` (both) | |
| iPhone Appearance page (new Watch setting) | `boards/appearance-page.png` (both) | |

Full-resolution captures of every fixture are in `screens/dark/` and `screens/mineral/` (23 each).

## The 11 production Watch screens (all translated, both palettes)

1. Session unavailable / retry: `idle`, `idle-unavailable`, `authority-warning` (W0, W9).
2. Session ready / end / discard: `orphan` (W0C).
3. Prepared / start: `start` (W0B).
4. Execution:
   - `normal`, `countdown`, `paused`, `bodyweight-superset`, `timed`, `review`, `always-on` (W1, W10, W10B, W12);
   - new: Review-gated.
5. Workout Metrics: `metrics` (W2). The retained production icons and colors are the acceptance correction.
6. Daily Totals: `daily-totals`, `daily-totals-stale` (W3).
7. Finish confirmation: `finish-confirmation` (W6). The same panel is used on the controls page.
8. Finishing / retry: `finishing`, `finishing-waiting` (W7).
9. Controls: `controls`, `controls-paused`, `health-failed` (W4, W5, W13).
10. Cancel confirmation: `cancel-confirmation` (W11).
11. Committed summary: `summary` (W8).

### What changed visually

- **Tokens.** The locked utility tokens:
  - navy `#061019` screen;
  - `#0F1C2A` quiet cells and `#132735` current cells;
  - purple `#AA98FF` primary, with dark label text;
  - green `#55E39A` progress, amber `#EFB84F`, red `#FF697A`.
- **Typography.** Plus Jakarta Sans throughout. It is now bundled in the Watch target via generator block `0x1EFF`.
- **Geometry** follows the board at true point scale:
  - 4 pt progress bar;
  - 26 pt context rows with a 42 pt role column;
  - 49 pt value tiles with 28 pt tabular values;
  - 25 pt rest;
  - 38 pt capsule actions;
  - 9 pt insets and a 4 pt grid.
- **Panel pages** keep their content just below the clock and pin their actions to the bottom edge: idle, start, orphan, confirmations, saving.
- **Finish confirmation and Saving** own the whole page; the set header is hidden, as on the board.
- **Retained exactly:**
  - Metric icons and per-metric colors: Time `#60A5FA`, Active `#FBBF24`, Total `#4ADE80`, Nutrition `#C084FC`, Heart Rate `#FF697A`.
  - The gesture model: swipe right for Controls, the Crown for Metrics and Totals.
  - The Finish/Cancel semantics.
  - Every accessibility identifier.
- **Always-On:** the same content at reduced saturation and luminance, with a dimmed action and the 15 s cadence.
- **Dynamic Type:** panel text grows only at accessibility sizes, capped and scrolling. watchOS defaults large cases above `.large`, so the standard sizes keep the board geometry. The fixed execution page keeps its fit-to-screen minimums.

## Independent Apple Watch appearance (addendum)

- **iPhone UI:** the accepted Appearance page has two sections, built from the same 88 pt option cards.
  - **IPHONE:** System / Dark / Mineral Light. "Light" is now titled "Mineral Light".
  - **APPLE WATCH:** Dark / Mineral Light.
  - A note says the choice applies the next time the Watch connects and changes neither the iPhone nor the Live Activity.
  - The Settings row now reads "iPhone … · Watch …".
- **Phone persistence authority:** `AppAppearanceStore`, UserDefaults key `physiqueos.appearance.watch.v1`. The iPhone key `physiqueos.appearance.preference.v1` is separate.
  - Separate setters (`select` / `selectWatch`); neither ever reads or writes the other.
  - Unset means Dark, and the default is never written. It is never inferred from the iPhone setting.
- **Sync path:** the established `PhoneWatchWorkoutConnectivityBridge` WatchConnectivity application context.
  - It adds a third slot, `physiqueos.watch.appearance.v1` (raw string), next to the projection and Daily Totals slots. `updateApplicationContext` replaces the whole dictionary, so every publish carries all three.
  - It is published at launch and on every change.
  - It is never blocked on reachability: the system delivers it when the Watch next activates.
  - There is no Server, network or Evidence involvement.
- **Watch persistence:**
  - `WatchWorkoutStore.appearance` is stored under UserDefaults `physiqueos.watch.appearance.v1` on the Watch and read at init. Launches with no phone, and active workouts, render immediately.
  - On reconnect, an absent slot (older phone) or an unknown value keeps the stored choice, so the palette never resets or flashes. Decoding is bounded (a string of 32 characters or fewer, a known case). A missing value falls back to Dark.
- **Palettes:**
  - `WatchPalette.dark` and `WatchPalette.mineralLight` resolve the same semantic roles. Every screen reads `WatchPhysiqueOSTheme.<role>`, and there are no per-screen color swaps.
  - The root rebuilds when the appearance changes.
  - Mineral comes from the light board: `#E8ECE5` mineral, `#FBFAF4` paper, `#D5ECE6` current, `#5C3FD2` purple with white labels, `#16875F`, `#C88228`, `#B83D4B`.
  - The Mineral metric accents are the acceptance board's light tokens: `#2563B8`, `#A85A00`, `#137847`, `#7540B8`, `#C73850`.
- **Live Activity:** not connected to the Watch preference, as instructed.

## Functional Watch findings

**A. Complete Set during Review / Final Confirmation — FIXED (presentation), authority unchanged.**
- **Root cause:** `WatchWorkoutProjection.make` set `canCompleteSet = phase == .active && currentSet != nil` and ignored the Logger step. The phone's Review / Summary / Evidence steps therefore projected an actionable Complete Set that the authority then refused (`sessionNotMutable`).
- **Fix:** the mapper now requires `TrainingSessionInvariants.acceptsExternalContentMutation(draft)`, the authority's own acceptance rule for Watch-origin content.
  - It also sends an additive `isPhoneReviewing` flag, so the Watch shows "REVIEWING ON IPHONE" with a disabled Complete Set.
  - The router and authority rejection is untouched and covered by a test.

**B. Timed sets showed "— / —" — FIXED.**
- **Root cause:** the wire `Row` carried only `loadText` and `repsText`. Duration-measured sets have no reps, so the reps tile was empty even though `valueText` held "45 s".
- **Fix:**
  - `Row` gets an additive `durationText`, which the mapper fills only when the measurement is `.duration`.
  - The Watch second tile shows the seconds under a "SECONDS" label, matching the phone Logger's column.
  - Older payloads decode unchanged (test).

**C. Reply-before-side-effects / projection build — NOT CHANGED (report only).**
- **No telemetry exists yet:**
  - The Build 88 `WatchBridge` lines (`m= queue= mutate= publish= app=`) and the Watch `WatchLatency` lines (`kind m= attempts rtt`) are on-device os_log only.
  - No Build 88 workout has happened since the upload.
- **Candidate** (bounded and safe, since everything runs in one main-actor turn): call `reply.send` right after `router().route(command)` returns, before `publishCurrentProjection()` and `finishCoordinator.reconcile()` run.
  - The mutation is already persisted inside `route` before the reply is built.
  - Publish and reconcile still run synchronously in the same turn, so no correctness changes.
  - Expected saving: exactly the logged `publish=` milliseconds.
  - A second candidate is to reuse one projection build per command; the ack and the context currently both build one.
- **Decide after the next real workout's correlated `m=` lines.** The instrumentation is preserved verbatim.

## Deviations from the static board (all deliberate, please review)

- **D1:** board 7 pt labels are rendered at 8 pt, the package's own Watch legibility rule ("labels should target 9–11 pt; never rely on the harness's scaled pixels").
- **D2:** quiet destructive actions (Cancel Workout, Discard) keep destructive red text.
  - The board renders them white only because of CSS specificity: `.watch-action.quiet` beats `.red`.
  - The package token rule says destructive is red with an explicit label.
- **D3:** content starts below the real watchOS clock (the existing 70% safe-area rule). The board's "10:09" is a smaller stand-in, so pages sit about 10 pt lower.
- **D4 (Mineral only, practicality), now resolved by Founder selection:** watchOS always draws the system time in white. Mineral now uses **Option A**:
  - a compact ink capsule behind the real system clock;
  - sized to the time shown and re-measured each minute;
  - centered on the clock and clamped to end at least 1 pt above page content.
  - The rejected full-width band, the B/C options and the DEBUG option seam are removed.
  - The options board stays in `../overnight-lane-a-watch-mineral-clock-options-20261006/`.
- **D5:** the light board's W13 "HEALTH START FAILED" eyebrow renders purple, again because of CSS specificity. Shipping uses the amber warning role in both palettes.
- **D6:** the "WORKOUT CONTROLS" eyebrow is purple, following the rendered board. It was muted in Build 88.
- **D7:** Mineral quiet labels use the acceptance board's `#5B7179`. The base board left the dark-muted `#92A5AF` on paper, which is too light.
- **D8:** the orphan copy is the board's single line ("iPhone isn't showing this workout."), so both actions stay on screen. The buttons carry the Save/Discard choice.

## Tests

**Watch unit tests: 56/56 pass.** Build 88 had 49; 7 tests are new:
- timed-set tiles;
- Review gating and its reason;
- the Dynamic Type rule;
- locked tokens with retained metric identity;
- appearance default, persistence, offline launch, reconnect and unknown values;
- palette resolution for both appearances.

**Phone focused tests: 130/130 pass**, covering:
- `TrainingSessionAuthorityTests`, which adds:
  - Review/Summary/Evidence projection gating, plus authority rejection through the real router;
  - set entry versus paused;
  - timed-set seconds;
  - backward-compatible wire decoding;
- `SharedUITests`, which adds:
  - Watch default Dark, never inferred;
  - the four cross-device combinations;
  - one-way independence;
  - unknown values become Dark;
  - application-context carriage;
  - titles;
- `WatchWorkoutTransportTests`;
- `WorkoutLiveActivityViewTests`.

**Watch UI tests: 6/7.**
- `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` **fails identically on untouched Build 88 source** (`7fce3b97`, same assertion, line 82). It is pre-existing and environment-dependent: the fixture shows the IPHONE UNAVAILABLE warning before the tap. It is not caused by this lane and is reported for follow-up.

## Files

- `ios/PhysiqueOSWatch/WatchWorkoutViews.swift`: the translation, palettes and primitives.
- `WatchWorkoutStore.swift`: appearance, reason flag, fixtures.
- `WatchWorkoutPreviewFixtures.swift`: 9 new DEBUG fixtures.
- `PhysiqueOSWatchApp.swift` and `Info.plist` (`UIAppFonts`).
- `ios/PhysiqueOS/Contracts/WatchWorkoutContracts.swift`: `durationText`, `isPhoneReviewing`, `WatchAppearancePreference`, appearance slot key.
- `ios/PhysiqueOS/Networking/WatchWorkoutProjectionMapper.swift` and `WatchWorkoutConnectivityBridge.swift`.
- `ios/PhysiqueOS/SharedUI/PhysiqueOSTheme.swift`: Watch preference in `AppAppearanceStore`.
- `ios/PhysiqueOS/Presentation/You/YouPlaceholderView.swift`: the Appearance page.
- `ios/PhysiqueOS/App/PhysiqueOSApp.swift`: wiring plus the DEBUG review override.
- `ios/Scripts/generate_project.py`: block `0x1EFF`, four pbxproj lines, stable on re-run.
