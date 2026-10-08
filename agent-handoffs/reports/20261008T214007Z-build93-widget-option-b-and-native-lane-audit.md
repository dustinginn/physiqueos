# Build 93 — Today widget Option B (isolated Native candidate) + Claude B Native lane audit

- Generated (UTC): 2026-10-08T21:40:07Z
- Task: `build93-claude-widget-option-b-implementation-20261008`, from prompt `agent-handoffs/inbox/prompts/20261008-build93-claude-widget-option-b-implementation.md` (commit `55942477`).
- Agent: Claude (existing Claude B Briefings/Native Remote Control conversation).
- Candidate branch: `claude/native-build93-widget-option-b-20261008`
  - final `293976fd`, code `9d3dd62c`;
  - based on the theme candidate `741d3562` (itself exactly on Build 92 `beaf5eff`);
  - version 1.0 (92).
- **Not done:** integration, deploy, build bump, archive, TestFlight, Recovery activation or release-pointer change. Production is still Server `84cc64e4` and Native Build 92.

## 1. What changed

### `ios/PhysiqueOSShared/HomeLoggedTodayWidgetView.swift` (shipping widget, both families)

**Square (`systemSmall`, Option B)**
- Nutrition and Active sit side by side at an **equal 17 pt**, with a 1 pt hairline divider.
- P/C/F are three **12 pt gram chips**.
- Today's weight is a quiet label line: "WEIGHT 176.1 lb", using the canonical string. When weight is shown, the spacing tightens by 3 pt so the square still fits.
- Missing values show "—" (never 0). Missing Nutrition shows "NOT LOGGED YET".
- The Today header, compact freshness ("12m", now 9 pt), refresh intent, privacy redaction, waiting/unavailable states and the `widgetURL` Start/Resume deep link are unchanged.
- The 44 pt refresh hit target is kept. A negative inset of `(44 − 24) / 2` stops it consuming header height, which is what frees the room.

**CTA (square and large)**
- Start Logger / Resume Workout use `palette.workoutAction` = `WorkoutActivityPrimaryAction`. This is the same shared token the Watch and Live Activity use: Dark `#EFB84F`, Mineral Light `#C88228`, ink `#10202A`.
- It replaces the teal-to-navy gradient. The large family's "Start Workout Logger" moved too, because it is the same action. Its layout is unchanged.

**Palette**
- Refresh (`refreshAccent` = teal `actionAccent`) is decoupled from the workout CTA and **stays teal**, as instructed.
- Status, metric and icon accents are untouched.
- A new `chip` token is added, and `actionGradient` is removed.

### `ios/PhysiqueOSTests/HomeWidgetTests.swift`

| Test | Covers |
|---|---|
| `testRefreshKeepsTheTealActionAccentWhileStartLoggerUsesTheWorkoutAmber` | replaces the old "refresh = Start Logger" assertion |
| `testStartLoggerIsTheSharedWorkoutAmberWithContrastSafeInk` | exact token hex values; contrast ≥ 4.5 in both themes |
| `testSquareRefreshTargetStaysAccessibleWithoutConsumingHeaderHeight` | glyph frame + 2 × inset = 44 |
| `testOptionBSquareFitsTheSystemSmallContentAreaInEveryState` | measured height ≤ 138 pt for full, no-weight, active workout, stale/offline, waiting, largest values (9,999 cal, 388/512/199 g, 2,345 active), not-logged and no-snapshot, in Dark and Light |
| Render harness | now uses WidgetKit-like 16 pt square margins and the widget's own container colour per theme, and adds `mineral-light/` square renders |
| `HomeWidgetOptionBAcceptanceRenderTests` | opt-in (`WIDGET_ACCEPTANCE_DIR`): the shipping square on the approved design fixture |

The fit test caught a real 2 pt overflow in the with-weight states before the spacing fix.

### Artifacts
- Folder `agent-handoffs/artifacts/home-screen-widget-v1` (all regenerated from the candidate; README updated):
  - 7 square Dark renders;
  - 7 new square Mineral Light renders (`mineral-light/`);
  - 7 large Dark renders.
- Folder `agent-handoffs/artifacts/build93-widget-option-b`: `approved/` holds the Option B design renders from `0627ae0a`; `shipping/` holds the candidate on the same fixture, Dark and Mineral Light, with and without weight.

No project or generator change: no new files, and the `0x20FF`/`0x21FF` blocks are untouched.

## 2. Tests

| Gate | Result |
|---|---|
| `HomeWidgetTests` (focused) | 27/27 |
| Full iPhone unit (`PhysiqueOSTests`) | **2,238 passed, 0 failures**; 2 skips (1 designed + 1 opt-in render) |
| Release build (generic iOS Simulator, unsigned) | succeeded; app embeds `PhysiqueOSLiveActivity.appex` (widget + Live Activity) and the Watch app |
| `verify_release_configuration.py` | 1.0 (92); Workout Live Activity + Home widget extension verified |
| Watch unit | not re-run: no Watch source changed on this branch. The theme candidate's 76/0 at `741d3562` stands. Skipped to keep disk headroom (14 GiB) |

## 3. Approved vs shipping comparison

On the same fixture (Founder-reported 1,139 cal / 649 active / 12m; illustrative macros 96 / 104 / 38), the shipping square reproduces approved Option B in both themes, with and without weight:
- the two columns;
- the chip row;
- the weight line;
- the amber CTA.

Known deltas:
- The header sits about 2 pt lower, because the shipping glyph frame is 24 pt (the design used 22).
- With weight, the chip gap is 7 pt and the weight gap is 3 pt (design: 8 and 5).

**All captures are SwiftUI renders of the shipping view by the shipping harness, not WidgetKit Home Screen screenshots.**

## 4. Platform notes and limitations

- **Appearance.** WidgetKit gives the widget its own environment, so it follows the **iOS system appearance**, not the in-app PhysiqueOS theme. A Mineral Light app on a Dark iPhone shows the Dark widget. This is unchanged and documented.
- **Redraw.** Widgets redraw on their own timeline and reload budget: currently app-triggered reloads, a midnight entry and a 45-minute policy. This change does not promise an immediate redraw after an app update.
- **Tinted/clear Home Screen modes** apply `widgetAccentable` as before. The amber is a full-colour mode token.
- **Text sizes.** Fixed point sizes match the existing widget convention. `minimumScaleFactor` (0.75 for figures, 0.8 for chips) is the overflow guard. Every state is measured to fit at the default size.

## 5. Integration notes for Codex A

- The branch includes the theme candidate (`741d3562`) as its base. Integrating this branch brings in the Watch/Live Activity theme too; integrating both is equivalent.
- Trial merges (`git merge-tree`):
  - **Codex Home/Morning `89378f31`: clean.**
  - **Codex Logger `f92f2291` branch: clean.**
  - **Claude Recovery Native `766bd9dc`:** conflicts only in `generate_project.py`/pbxproj, the known theme-vs-Recovery conflict. Keep both pinned blocks (`0x20FF` Recovery, `0x21FF` theme) and regenerate.
- The widget files conflict with nothing.
- **Gotcha:** running `HomeWidgetTests` rewrites the tracked `home-screen-widget-v1` PNGs. On the integration branch, either commit the regenerated set or restore it.
- Held Energy code is not included.

## 6. Claude B Native lane audit (from latest reports and backlog)

| # | Item | State | Owner / next |
|---|---|---|---|
| 1 | Watch + Live Activity amber / Mineral Light Live Activity | Candidate `741d3562`, tested, not integrated | Integration (Codex A or Founder) |
| 2 | Today widget Option B + amber CTA | **This candidate `293976fd`** | Integration; Founder Home Screen acceptance after release |
| 3 | Recovery content correction | Server `208edfc7` + Native `766bd9dc`, tested. Founder still to review the comparison and two held subparts ("Training performance held"; Monthly sub-line "status unchanged") | Founder decision; then cherry-pick and integrate |
| 4 | Recovery activation path | Needs separately authorized steps: Server deploy, zero-write real Sleep shadow calibration, authority install. First theoretical Weekly Oct 25, Monthly Dec 1 | Founder authorization |
| 5 | DEXA → Apple Health (Oct 9 scan) | Writeback is live prospectively. The guarded Sep 12 validation controls are kept until the first real write is verified, then should be hidden in the next consolidated Native build | After the Founder confirms the Oct 9 write: a narrow Native cleanup candidate |
| 6 | Pre-existing Watch UI harness failure `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns` (no WCSession in the fixture harness) | Known; listed in Build 92 | Small test-harness fix candidate |
| 7 | 6 order-dependent Sandbox iPhone UI failures in long runs | Test-isolation maintenance item from Build 92 | Small test-isolation candidate |
| 8 | Physical acceptance: Build 91/92 Watch footer and ready haptic; Live Activity Mineral Light on device; widget on Home Screen | Pending real-device use | Founder; I can prepare a checklist |
| 9 | Refresh glyph colour | Teal kept; no Founder decision yet | Founder (optional) |

## 7. Recommended next narrow, non-overlapping Claude B tasks (none started)

1. **Watch UI harness WCSession stub** (item 6): test-only. It makes the Watch UI suite fully green for the Build 93 gate and does not overlap Codex work.
2. **Sandbox UI test-isolation fix** (item 7): test-only. It makes the long iPhone UI run deterministic for the combined Build 93 gate. It touches UI test setup only, so coordinate with Codex if they are editing UI tests.
3. **After the Founder confirms the Oct 9 DEXA write** (item 5): hide the guarded Sep 12 validation controls in a narrow Native candidate.
4. **Build 93 physical-acceptance checklist** (item 8): a short report the Founder can run on device after the release.

The Recovery held subparts (item 3) and activation (item 4) wait for Founder decisions; I would not start them unprompted.

## 8. Disk and coordination

- Free disk was 18 GiB at the start and 14 GiB after builds (floor 12). Heavy Xcode runs were serialized, and no concurrent Codex Xcode job was observed.
- Lane simulator "B93 Widget B" and DerivedData `dd4` are removed after this report; the Release DerivedData was already removed.
- Archives 85–92, other simulators, worktrees and credentials are untouched.
