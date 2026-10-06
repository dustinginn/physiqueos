# Overnight Lane A — Watch, Live Activity, Priority Detail and Daily Capture: ready for Founder review

- **Task:** `overnight-lane-a-watch-live-priorities-capture-20261006`.
- **Prompts:**
  - `agent-handoffs/inbox/prompts/20261006T052100Z-overnight-claude-a-watch-live-priorities-checkin.md` @ `533023f6`;
  - addendum `20261006T053500Z-claude-a-watch-independent-appearance-addendum.md` @ `6cc07624`.
- **Agent:** Claude, in a Remote Control chat with high reasoning, in the single RC worktree. No EnterWorktree and no secondary worktree were used.
- **Base:** Build 88 `7fce3b9708c063f3c6b58571778c595012b5de6d`, VALID in TestFlight.
- **Lane branch:** `claude/overnight-lane-a-watch-live-priorities-capture-20261006`.
  - **Final lane SHA: `36e97854`.**
  - Last code commit: `3d112478` (A6 regression fixes).
- **Production Server:** unchanged. **Not done:** no deploy, no TestFlight upload, no build bump, no merge.
- **latest.json / latest.md:** still point at Build 88. This report is published on its own.

Every checkpoint below is **ready for Founder review, not accepted**. Continuing overnight was authorized; that is not visual acceptance.

## Checkpoint review packages (all on the lane branch)

| Checkpoint | Package (mobile-width PNG boards plus README) | Code |
|---|---|---|
| A1 + A2: Apple Watch, all 11 production screens, Dark and Mineral, plus functional fixes and the independent Watch appearance | `agent-handoffs/artifacts/overnight-lane-a-cp-a1-a2-watch-20261006/` | `cb64e771` |
| A3: Live Activity and Dynamic Island | `agent-handoffs/artifacts/overnight-lane-a-cp-a3-live-activity-20261006/` | `461b3651` + fix `3d112478` |
| A4: Priority Detail family, every variant and state | `agent-handoffs/artifacts/overnight-lane-a-cp-a4-priority-detail-20261006/` | `5f5df553` |
| A5: Morning Check-In, manual/backdated weight, Home Confidence | `agent-handoffs/artifacts/overnight-lane-a-cp-a5-daily-capture-20261006/` | `97028dbc` + fix `3d112478` |
| A6: integrated regression and index | `agent-handoffs/artifacts/overnight-lane-a-cp-a6-final-20261006/` | `3d112478` (gates below) |

Browse them on GitHub: `dustinginn/physiqueos`, select the lane branch above, then open `agent-handoffs/artifacts`.

Boards to open first:
- Watch: `a1-dark.png`, `a1-mineral.png`, `a2-dark.png`, `a2-mineral.png`, `before-after.png`, `appearance-page.png`.
- Live Activity: `la-dark.png`, `la-mineral.png`, `la-island.png`.
- Priority Detail: `pd-dark.png`, `pd-light.png`.
- Daily capture: `cap-dark.png`, `cap-light.png`.

Every board places the locked reference beside the real shipping SwiftUI, on the matched device and scale. Watch renders use the Apple Watch Ultra 3 simulator, which is the Founder's Watch.

## Before / after (summary)

**Watch (Build 88 → Lane A):**
- The fixed purple-era palette and SF Rounded are replaced by the locked utility tokens:
  - navy `#061019`, quiet `#0F1C2A` and current `#132735` cells;
  - purple `#AA98FF` with dark labels, green progress;
  - Plus Jakarta Sans.
- Geometry follows the board's true-point layout:
  - 4 pt progress bar, 26 pt rows, 49 pt tiles, 28 pt tabular values;
  - 25 pt rest, 38 pt capsule actions.
- Panel pages pin their actions to the bottom edge. Finish confirmation and Saving own the whole page.
- The production metric icons and colors are retained exactly (acceptance correction).

**Live Activity:**
- The fixed dark-purple palette is replaced by teal current/action, green rest, amber needs-update and restrained purple lifecycle.
- The Lock Screen follows the iPhone system appearance; the Island stays system black.
- **Live Activity uses SF system faces.** ActivityKit cannot archive a custom variable font; see the regression below.

**Priority Detail:**
- 10 of 11 production variants were on the legacy `CardContainer` page. All now use the accepted Foam pilot's locked template.
- Foam's private palette moved to shared `PhysiqueOSTheme.priority*` tokens.

**Daily capture:**
- Legacy `CardContainer` / `.borderedProminent` / orange chips are replaced by the locked capture grammar: crumb, hero, form surfaces, 44 pt disposition chips, 74 pt weight field, left-ruled messages.
- The Confidence sheet gets an 80 pt ring header and divided factor groups.

## Functional Watch findings

**A. Complete Set during the phone's Review / Final Confirmation — FIXED (presentation); the authority is unchanged.**
- **Root cause:** `WatchWorkoutProjection.make` computed `canCompleteSet = phase == .active && currentSet != nil` and ignored the Logger step. On Review, Summary or Evidence the Watch showed an actionable Complete Set that the phone authority then refused (`sessionNotMutable`).
- **Fix:**
  - The mapper now also requires `TrainingSessionInvariants.acceptsExternalContentMutation(draft)`, the authority's own rule for Watch-origin content.
  - It sends an additive `isPhoneReviewing` flag, so the Watch shows "REVIEWING ON IPHONE" with a disabled Complete Set.
  - Command rejection still holds and is proven through the real router.

**B. Timed sets showed "— / —" — FIXED.**
- **Root cause:** the wire `Row` carried only `loadText` and `repsText`, and duration sets have no reps.
- **Fix:** an additive `durationText` (seconds, duration measurement only). The Watch's second tile shows it under "SECONDS", matching the phone Logger's column.
- Older payloads decode unchanged.

**C. Reply-before-side-effects / projection build — NOT CHANGED (report only).**
- No Build 88 workout has happened yet, and the `WatchBridge` / `WatchLatency` lines are on-device os_log only. There is no telemetry.
- **Candidate** (bounded and safe; everything runs in one main-actor turn, and the mutation is persisted inside `route` before the reply is built): send the reply right after `router().route(command)`, before `publishCurrentProjection()` and `finishCoordinator.reconcile()`. The saving equals the logged `publish=` ms.
- **Second candidate:** build the projection once per command.
- Decide after the next real workout's correlated `m=` lines. The instrumentation is preserved verbatim.

## Independent iPhone / Apple Watch appearance (addendum)

| Item | Detail |
|---|---|
| UI | The accepted Appearance page now has an **IPHONE** section (System / Dark / Mineral Light) and an **APPLE WATCH** section (Dark / Mineral Light), built from the same 88 pt option cards. A note says the choice applies the next time the Watch connects and does not change the iPhone or the Live Activity. The Settings row reads "iPhone … · Watch …". |
| Phone persistence authority | `AppAppearanceStore`, UserDefaults `physiqueos.appearance.watch.v1`. The iPhone key `physiqueos.appearance.preference.v1` is separate. Separate setters; neither reads or writes the other. |
| Default / migration | An unset Watch appearance is **Dark**. It is never inferred from the iPhone, and the default is never written. Unknown stored values become Dark. |
| Sync path | The established `PhoneWatchWorkoutConnectivityBridge` WatchConnectivity **application context**, in a third slot `physiqueos.watch.appearance.v1` (raw string) next to the projection and Daily Totals slots. It is published at launch and on change, never blocked on reachability, and delivered when the Watch next activates. There is no Server, network or Evidence involvement. |
| Watch persistence | `WatchWorkoutStore.appearance`, stored under UserDefaults `physiqueos.watch.appearance.v1` and read at init. Offline launches and active workouts render without the phone. A missing or unknown value on reconnect keeps the stored choice, so there is no flash. Decoding is bounded. |
| Palettes | `WatchPalette.dark` and `WatchPalette.mineralLight` sit behind one set of semantic roles; there are no per-screen swaps. |
| Mineral practicality | watchOS always draws the system clock in white. A slim ink band behind the clock zone keeps it legible on a real Watch. This is a deliberate deviation from the static board: **please review it.** |
| Live Activity | Not tied to the Watch preference. |

## Tests

| Gate | Result |
|---|---|
| Full Native unit suite (`PhysiqueOSTests`) | **2085 tests, 0 failures, 1 skipped.** Build 88 had 2066; 19 are new. |
| Full Watch unit suite | **56/56.** Build 88 had 49; 7 are new. |
| Full Watch UI suite | **6/7.** The failure is `testFinalSetFinishShowsConfirmationOnThePrimarySurfaceAndNotYetReturns`, which **fails identically on untouched Build 88 `7fce3b97`** (verified in this session). Root cause: the fixture has no `WCSession`, so `requestFinish` → `issue()` fails closed to `.phoneUnavailable`. This is a pre-existing harness gap, not caused by this lane. |
| Full iPhone UI suite (`PhysiqueOSUITests`, 65 tests, erased simulator, on `3d112478`) | **65 / 65.** 64 passed in the full run. `testCorrectedEvidenceJourneys` (DEXA Evidence scroll, untouched by this lane) failed only at load 110–150 and passed on re-run at normal load. It also passed in the first full run. |
| Lane focused UI (`FoamRollingPriorityDetailUITests`, 14) | All pass. This includes the Priority family (12 variants), Morning, manual weight, Confidence, Watch appearance, and the accepted Foam parity and Home parity tests. |
| Generic Release build (iOS, Watch and Widget/Live Activity extension) | **BUILD SUCCEEDED.** `verify_release_configuration.py` OK: version 1.0 (88), unchanged. |
| Generator stability | Re-running `generate_project.py` produces no diff. The only project additions are 4 Watch-only `PBXBuildFile` lines in the new pinned block `0x1EFF`; nothing renumbered. |
| Seam scan (Release binaries) | 0 occurrences of every Lane A DEBUG seam in the app, Watch and extension binaries. Plus Jakarta Sans is bundled in the Release Watch app. |

**New deterministic coverage includes:**
- Watch Complete Set gating, including authority rejection;
- the timed-set projection;
- Watch state rendering;
- the Dynamic Type rule;
- tokens and retained metric identity;
- Watch appearance: default, persistence, offline launch, reconnect, unknown values, palette resolution;
- iPhone/Watch independence across all four combinations;
- application-context carriage;
- Live Activity: both appearances within the 160 pt budget, and the Island stays Dark;
- Priority Detail: templates, invalid actions, dose-aware only for peptides, consolidation, href mapping, unavailable copy;
- Morning dispositions (selected trait, 44 pt);
- manual weight: Return to Log only after a durable save;
- Confidence V3/V2 groups, with no Assumptions;
- Appearance page accessibility.

## Regressions found by the integrated gate, and fixed (`3d112478`)

The first full iPhone UI run on `9aba5e96` had 10 failures. All 10 passed on untouched Build 88 (verified on a freshly erased simulator), so they were genuine Lane A regressions.

1. **Live Activity extension crash.**
   - SwiftUI's ActivityKit display-list encoder trapped (`CodableAttributedString` → `KEY_TYPE_OF_DICTIONARY_VIOLATES_HASHABLE_REQUIREMENTS`) on the Jakarta `UIFont` / `UIColor`-backed styling.
   - That killed the extension during Finish. `LoggerParity` CP4 failed and left a draft, which cascaded into 8 Logger journeys.
   - **Fix:** Live Activity uses SF system faces and plain sRGB colors, and the Mineral Lock Screen page is drawn by the view. Jakarta was removed from the extension target.
   - **Verified:** all 10 pass on an erased simulator, with no new crash reports.
2. **Manual weight Today shortcut.**
   - The compact-picker overlay dropped the shared `DateField` sheet (Today / Done).
   - **Fix:** an additive `DateField` `.capture` style keeps the sheet behavior unchanged.

Lesson: in-process render tests cannot catch extension archiving. Only a real ActivityKit run, as in the UI journeys, can.

## Known unresolved items and deviations

1. **Watch label size.** Watch labels are drawn at 8 pt, not the board's 7 pt, per the package's own Watch legibility rule.
2. **Destructive red text.** Quiet destructive actions (Cancel Workout, Discard) keep red text. The board renders them white only through a CSS-specificity artifact.
3. **Mineral clock band.** See the addendum table above.
4. **Live Activity height and font.** Live Activities cap at 160 pt; the board frame was 175 pt of content, so all sizes are kept and only the padding was trimmed. The board uses Jakarta; shipping uses SF because ActivityKit cannot archive the custom variable font.
5. **Founder decision: Priority Detail tokens.** The locked Priority Detail and daily-capture boards specify their own near-identical palettes (`#06121D` / `#06131E` canvases, …). They differ slightly from the Home/utility `redesign*` tokens (`#061019`). Lane A keeps each locked set exactly, now in shared `PhysiqueOSTheme.priority*` / `capture*` tokens. Unifying them is a token-only change if you want one palette.
6. **Photos/DEXA Priority action hrefs are now wired.**
   - Three verified Server hrefs map to existing Native screens: `/evidence/photos` → Photos intake, `/evidence/dexa` → DEXA intake, `/profile/operating-plan/execution/dexa` → DEXA appointment.
   - This is presentation wiring for locked routes, not a general router.
   - Please confirm the destinations on device.
7. **Manual weight: Return to Log only after a durable save.** Build 88 also showed it while still reconciling. Lane A follows the lock ("Success alone reveals Return to Log").
8. **Pre-existing failures reported, not fixed:**
   - the Watch UI test above;
   - `HomeWidgetTests` rewrites tracked PNGs under `agent-handoffs/artifacts/home-screen-widget-v1/` on every unit run. They were restored, never committed.
9. **Operational note.** Early in the night one test command ran `xcrun simctl shutdown all`, which may have interrupted a Simulator another lane had booted. Since then only Lane A devices are used: `LaneA Watch Ultra3 49mm`, `LaneA Watch S12 42mm`, `LaneA iPhone 17 Pro`.
10. **Device acceptance.** Live Activity was validated through the shipping-view render harness and Simulator only. Physical Lock Screen, Island and Watch acceptance is still needed.

## Integration map onto Build 88

- **Base:** the lane branches directly from `7fce3b97`, a linear series of 11 commits (`e2fb6ee4` … `36e97854`).
- **Code changes:** 33 files under `ios/` (now including `SharedUI/DateField.swift`, an additive style).
  - `PhysiqueOSWatch/*`;
  - `PhysiqueOSShared/WorkoutLiveActivityViews.swift`, `PhysiqueOSLiveActivity/*`;
  - `Presentation/Home/PriorityDetailView*`, `ConfidenceDetailSheet`, `HomeView` (a 6-line DEBUG seam);
  - `Presentation/Logging/ManualWeighInView.swift`;
  - `Presentation/You/YouPlaceholderView.swift` (the Appearance page);
  - `SharedUI/PhysiqueOSTheme.swift` (additive tokens and Watch preference), `Typography.swift` (additive), `NumericEditField.swift` (one additive parameter);
  - `Contracts/WatchWorkoutContracts.swift` (additive optional fields);
  - `Networking/WatchWorkoutProjectionMapper.swift`, `WatchWorkoutConnectivityBridge.swift`, `ProductionDailyDriverAPI.swift`;
  - `App/PhysiqueOSApp.swift`, `Root/RootTabView.swift` (one review route);
  - `Scripts/generate_project.py` and the pbxproj (block `0x1EFF`).
- **Wire compatibility:** additive optional fields only. An older Watch ignores them; an older phone omits them, and the Watch keeps its stored or default Dark appearance. No schema bump.

## Likely conflicts with Claude B (Briefings lane)

- **Current state.** Claude B's pushed branch (re-checked at `8d085cbb`) shares exactly one file with Lane A, `Presentation/Root/RootTabView.swift`. A trial `git merge-tree` of Lane A × Lane B is **conflict-free**.
- **Watch as B continues:**
  1. `generate_project.py`: Lane A uses pinned block `0x1EFF` and left `0x1DFF` free. If B also adds a block after Batch 3, ordering asserts may need a trivial reorder. No IDs collide by construction.
  2. `PhysiqueOSTheme.swift`: Lane A appends token groups just above `private static func dynamic`. B adding tokens at the same anchor is a textual (not semantic) conflict; keep both.
  3. `Typography.swift`: Lane A appends four `priorityDetail*` styles after `priorityDetailAction`.
  4. `HomeView.swift`: Lane A adds a DEBUG `.onAppear` after the Confidence `.sheet`. If B touches Home's Latest Briefing area, this is likely clean.
  5. `RootTabView.swift`: Lane A adds one review route line (`morning-check-in`) after `manual-weight`.
- **Briefing History (B06)** is in the same Final Design Batch 2 package. Lane A deliberately left it to Claude B.

## Next Founder actions

1. Review the five checkpoint packages: Watch Dark and Mineral, Live Activity, Priority Detail, daily capture.
2. Decide:
   - the Mineral Watch clock band;
   - unifying the Priority/capture tokens with `redesign*`;
   - the Photos/DEXA action wiring.
3. When accepted, authorize integration of `36e97854` onto release authority and a Build 89 candidate. Integrating Claude B's lane is a separate decision.
