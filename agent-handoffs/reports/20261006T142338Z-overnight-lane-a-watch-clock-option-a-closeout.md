# Overnight Lane A — closeout: Founder-approved Watch clock treatment applied; final candidate ready for integration

- **Task:** `overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Prompts:**
  - `20261006T141500Z-claude-a-watch-mineral-clock-options.md` @ `e6abff2b` (options);
  - `20261006T143500Z-claude-a-apply-watch-clock-option-a.md` @ `3afd3f57` (Option A selected).
- **Lane branch:** `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
  - **Final Lane A SHA: `f3579d87b2f111bd6da0e78ff928e7492efffc00`.**
  - Last code commit: `7932f963`.
- **Base:** Build 88 `7fce3b97`.
- **Status:** **FOUNDER VISUAL APPROVED, pending integrated-build physical-device acceptance.**
- **Not done:** no merge, no build bump, no TestFlight upload, no Server deploy, no production mutation. latest.json is unchanged (Build 88).

## What changed in this closeout

- **Option A is the only shipping Mineral clock treatment.**
  - **Shape:** a compact ink capsule (21 pt tall, 8 pt horizontal padding) behind the real watchOS system time. It is sized to the time shown and re-measured each minute.
  - **Placement:** centered on the measured clock position, top-trailing at half the top safe area. It is clamped to end at least 1 pt above page content.
  - **Scope:** applied once at the Watch root, so it covers every Mineral screen and state.
- **Removed from source:**
  - the rejected full-width band;
  - options B (patch) and C (halo);
  - the DEBUG `-watchClockTreatment` seam.

  The option review artifacts stay in `agent-handoffs/artifacts/overnight-lane-a-watch-mineral-clock-options-20261006/`.
- **Dark Watch is unchanged.** The capsule is driven by `WatchPalette.mineralLight.clockCapsule`, which is `nil` for Dark.
- **Scope of the code change since the approved candidate `36e97854`:** exactly two files, `ios/PhysiqueOSWatch/WatchWorkoutViews.swift` and `ios/PhysiqueOSWatchTests/WatchWorkoutFinishStateTests.swift`. Everything else is byte-for-byte unchanged:
  - Watch layout and functional work (Complete Set gating, timed sets);
  - iPhone/Watch appearance persistence and sync;
  - Live Activity / Dynamic Island;
  - Priority Detail, Morning Check-In, manual weight, Home Confidence.

## Fit and accessibility

- **Geometry**, measured from the DEBUG geometry fixture:
  - Ultra 3 (49 mm): page 207 pt wide, top safe area ≈57 pt, content starts at 40.
  - 42 mm: 183 pt, ≈48.6 pt, content starts at 34.
- **Fit:** the capsule clears the progress bar, the status/title line and the page indicator on both, and covers the white digits on both.
- **Always-On:** the capsule stays (same content, dimmed page); the clock remains legible.
- **Accessibility:** the capsule is non-interactive and hidden from VoiceOver.

## Focused gates (on `7932f963`)

| Gate | Result |
|---|---|
| Watch unit suite | **57 / 57**, including the new `testMineralClockCapsuleIsCompactAndClearsContentOnBothCaseSizes` and the palette / appearance / offline / reconnect tests. |
| Watch UI suite | **6 / 7.** The only failure is the pre-existing `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`, which fails identically on untouched Build 88 (fixture has no WCSession). |
| Appearance independence and sync, phone (`SharedUITests` plus `TrainingSessionAuthorityTests`) | **120 / 120.** |
| Watch appearance control UI test | **Pass.** |
| Generic Release build (app, Watch, Widget/Live Activity extension) | **BUILD SUCCEEDED.** `verify_release_configuration.py` OK (1.0 (88)). |
| Seam scan of the Release binaries (app, Watch, extension) | **0** (includes `watchClockTreatment`). No band or option code remains in source. |
| Generator stability | Re-running produces no diff. No project files were touched. |

The full iPhone UI suite was not re-run, because no iPhone source changed.

## Final review boards (verified HTTP 200 at `f3579d87`)

All under `agent-handoffs/artifacts/overnight-lane-a-cp-a1-a2-watch-20261006/boards/`:
- `mineral-clock-final.png`: the rejected band beside Option A, then Option A on execution, metrics, summary and Always-On at 49 mm and 42 mm.
- `a1-mineral.png`, `a2-mineral.png`: every Mineral Watch screen with Option A.
- `a1-dark.png`, `a2-dark.png`: Dark (unchanged).
- `fit-42mm.png`: 42 mm Dark/Mineral fit, plus capsule states.

The other Lane A packages (A3 Live Activity, A4 Priority Detail, A5 daily capture, A6 gates) are unchanged.

## Next

1. **Founder physical-device acceptance:** the Ultra 3 Mineral clock capsule, plus the rest of Lane A in an integrated build.
2. **Integration** of `f3579d87` onto release authority and a Build 89 candidate, when authorized. Claude B's lane merges cleanly (`merge-tree` at `8d085cbb`; one shared file, `RootTabView.swift`).
