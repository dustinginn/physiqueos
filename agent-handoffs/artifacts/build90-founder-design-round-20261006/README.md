# Build 90 design round: Founder options review

**Status: options ready for Founder selection. No winner has been chosen and no production behavior has been implemented.** Build 90 is not bumped, nothing was uploaded to TestFlight, and there was no Server or production change.

- **Base:** Build 89 shipped source `51399425`.
- **Branch:** `claude/native-build90-founder-design-round-20261006`.
- **Rendering:** every capture is real shipping SwiftUI. The iPhone screens ran on the iOS 27 iPhone 17 Pro simulator in Sandbox; the Watch screens on watchOS 27 Ultra 3 (49 mm) and Series 12 (42 mm). The options are reached only through DEBUG review seams.
- **Same data in every column:** each board shows one state.
- **Technical findings:** [IMPLEMENTATION-AUDIT.md](IMPLEMENTATION-AUDIT.md) (source files, state authority, conflicts, watchOS limits, test plans, Server impact).

## B90-1 · iPhone Logger rest stopwatch (#7)
| Board | State |
|---|---|
| [B90-1a](boards/B90-1a-stopwatch-no-rest.png) | No active rest (before the first set): Current, A, B, C |
| [B90-1b](boards/B90-1b-stopwatch-active-rest.png) | Active stopwatch rest: Current, A, B, C |
| [B90-1c](boards/B90-1c-stopwatch-long-scrolled.png) | Long workout scrolled to the end: Current, A, B, C |
| [B90-1d](boards/B90-1d-stopwatch-dark.png) | Dark, active rest: A, B, C |

**The three options:**
- **A · docked tile:** a stopwatch tile beside Finish Workout, inside the sticky bar. With no rest running it shows the WORKOUT clock, which is the Live Activity rule. This is your current lean.
- **B · floating pill:** a compact pill directly above the sticky bar. It appears only while rest is running.
- **C · footer status line:** a quiet status line inside the sticky bar above a full-width Finish Workout.

**What all three share:**
- They read the one canonical rest anchor (`draft.rest`), the same source as the Watch and Live Activity, and add no timer state.
- They work phone-only.
- They hide during Finish confirmation (the Build 83 rule).
- They never cover set rows or the tab bar.

**Open decision D-1a:** should the phone get an "End rest" control? See the audit.

## B90-2 · Guided iPhone → Watch handoff (#8)
| Board | State |
|---|---|
| [B90-2a](boards/B90-2a-handoff-offer.png) | Paired initial state: Current (the Build 89 card), A, B, C |
| [B90-2b](boards/B90-2b-handoff-waiting.png) | Connecting / waiting |
| [B90-2c](boards/B90-2c-handoff-acknowledged.png) | Watch acknowledged (auto-dismisses) |
| [B90-2d](boards/B90-2d-handoff-unreachable.png) | Paired but unreachable fallback |
| [B90-2e](boards/B90-2e-handoff-dark.png) | Dark |
| [B90-2f](boards/B90-2f-handoff-after-flow.png) | After the flow: what replaces the Ready for Watch card, plus Use without Watch |

**The three treatments:**
- **A:** a system bottom sheet.
- **B:** a centered card over a dimmed Logger.
- **C:** a panel docked in the sticky-bar slot, so the Logger stays scrollable and live.

**What watchOS allows:**
- The phone *can* ask watchOS to open PhysiqueOS on the Watch, using `HKHealthStore.startWatchApp`.
- It *cannot* guarantee the Watch app comes to the front: not when the Watch is locked, asleep, off-wrist or out of range.
- So the Waiting state always carries the "open PhysiqueOS on your Watch and tap Start Workout" instruction.

**Acknowledgment:** it comes from the phone's own authority recording the Watch's Start.

**Open decision D-2a:** dismiss on Watch *readiness* or on Watch *Start*? See the audit.

**The large Ready for Watch card is removed.** After the flow:
- if the Watch acknowledged, a quiet "On Watch" chip appears;
- if you chose Use without Watch, you get the normal Logger and no re-prompt.

## B90-3 · Photo Briefing expanded viewer
| Board | Pose / appearance |
|---|---|
| [B90-3a](boards/B90-3a-photo-front-mineral.png) | Front Relaxed · Mineral: Current, A, B, C |
| [B90-3b](boards/B90-3b-photo-back-mineral.png) | Back Relaxed · Mineral |
| [B90-3c](boards/B90-3c-photo-flexed-mineral.png) | Back Flexed · Mineral |
| [B90-3d](boards/B90-3d-photo-wide-frame-mineral.png) | Wider frame (1:1 crop) · Mineral |
| [B90-3e](boards/B90-3e-photo-front-dark.png) | Front Relaxed · Dark |
| [B90-3f](boards/B90-3f-photo-wide-frame-dark.png) | Wider frame · Dark |

**The three options:**
- **A · captioned stage:** a top-anchored stage, with PREVIOUS/date and CURRENT/date captions under each photo and the interpretation below.
- **B · centered group:** labels on the photos, the interpretation in a card, and a zoom pill on the stage.
- **C · framed panel:** column headers and a zoom row inside a panel, with the interpretation beneath under an eyebrow.

**What all three share:**
- The stage is sized to the photos, so there are no blank bands. Pinch zoom and synchronized pan are unchanged and bounded to the stage.
- The interpretation is the canonical persisted per-pose narrative.

**Photos:** these are safe synthetic review photos. No Founder media is published; real-media validation is reserved for device acceptance.

## B90-4 · Watch primary button placement
| Board | Content |
|---|---|
| [B90-4a](boards/B90-4a-watch-start-button-mineral.png) | Start Workout · Mineral · 49 mm and 42 mm: Current, A (centered), B (optical, 42%) |
| [B90-4b](boards/B90-4b-watch-shared-impact.png) | Dark, plus the shared impact on Idle (Refresh) and the Apple Health orphan prompt |

- **The screen:** the described screen matches **Start Workout** ("READY FOR WATCH"). Its layout comes from the shared `WatchPanelPage`, which the Idle and orphan screens also use.
- **What changes:** only the vertical position. Button size, style, tap target and action are unchanged.

## Release safety
**Release behavior is Build 89.** Every option is DEBUG-only:
- `-physiqueos.b90.*`;
- `-watchPanelActionPlacement`.

**Non-DEBUG changes:**
- `PhotoComparisonInspection.narrative` is passed through but not rendered by the Release viewer.
- `WatchPanelActionLayout` uses the Release fraction 1.0, the same bottom-pinned geometry as Build 89, including the 18 pt minimum gap.

**Verification:**
- **Release builds:** the Release iPhone build (generic iOS, unsigned) succeeds and embeds the Watch app.
- **Seam-string scan:**
  - 0 hits in the Release iPhone binary and both Release Watch binaries;
  - positive control: 8 hits in the Debug iPhone dylib and 1 in the Debug Watch dylib.
- **Focused iOS unit tests:** 326 / 0 failures across Briefing V3, Build 83 finish lifecycle, Photo Briefing, Photo inspection, Training Logger, rest preference, session authority and live projection.
- **Watch unit tests:** 57 / 0.
- **Capture UI tests:** 14 / 14 passed.
- **Other checks:** `git diff --check` is clean; no project or generator change.

## Provenance and reproducibility
- **Raw captures:** `captures/b90-1` … `captures/b90-4`.
- **Boards:** composed by `source/compose_board.py` from `source/boards/*.json` (which `source/make_specs.py` writes). Captures are only scaled and labeled.
- **iPhone capture journeys:** `Build90DesignRoundCaptureUITests` in `ios/PhysiqueOSUITests/TrainingAcceptanceUITests.swift`. Run them with `TEST_RUNNER_B90_CAPTURE_DIR=<dir>`.
- **Watch captures:** `xcrun simctl launch … -watchFixture start|idle|orphan -watchAppearance mineralLight|dark -watchPanelActionPlacement bottom|centered|optical`.
- **Frozen clock values:** the clock readings (1:24 rest, 12:34 workout) are frozen by `-physiqueos.b90.rest-seconds` / `-physiqueos.b90.workout-seconds` for comparison. The clock still appears only when the canonical anchor exists.

## Next
1. Pick one option per item, and answer D-1a and D-2a.
2. A separate implementation task then makes the selections production behavior, removes the other options and the seams, adds the tests listed in the audit, and runs the full regressions.
3. Build 90 is then bumped only when that task is authorized.
