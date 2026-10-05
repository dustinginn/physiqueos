# Redesign Batch 2 · Checkpoint 1: Log root

Task id: `redesign-batch2-implementation-20261005`

Status: **CHECKPOINT 1 ready for Founder visual review. STOPPED.** Checkpoint 2 (Logger active workout) has not started.

Agent: Claude, in the existing Batch 2 Remote Control chat. A single RC worktree was used throughout: no EnterWorktree and no secondary worktree.

Generated (UTC): 2026-10-05T04:53:52Z

## Authority

- **Prompt:** `841190297b1dfd430c3489d7c8341037b201e851`.
- **You/Settings tap-target addendum:** `86210001cfc9d83a21db6d0df0e662dab3052975`.
- **Native base:** Build 87 `f66c7fc690b1b61094e620791ee2d4a40caf3799`. It contains accepted Batch 1 `c4a74ad0`.
- **Native Checkpoint 1:** `b540b323f4af4a79b20a9b61e2f7b03d46532ae3`.
- **Native addendum fix:** `bb6a6584274be62b95d74bb273ff1af3585b4fa0`.
- **Native branch:** `claude/redesign-batch2-log-logger-20261005`, pushed. It is not merged and no build was uploaded.
- **Server production (unchanged):** `27dad44a`, deployment `99188a9e` ACTIVE. `/api/v1/health/live` reports `physiqueos-27dad44a`.
- **Server D1 candidate:** `c7c99347a520d13fd344fe89b6b1398877cdd255` on branch `claude/log-sources-provenance-server-20261005`, which sits on top of `27dad44a`. **It is not deployed.**
- **Locked design authorities:**
  - Log Compact Command Center: `ec425a96`.
  - Realistic density and centralized Sources: `97807d50` / `6029bbfa`.
  - Exact reference PNGs are listed in the artifact README.

## Review package (main-visible)

`agent-handoffs/artifacts/redesign-batch2-cp1-log-root-20261005/`

- **Start with `primary-mobile-review-board.png`.**
- `boards/` holds the reference, the simulator and an amplified diff for the loaded top, Sources collapsed and Sources expanded, in Dark and Mineral.
- `states-board.png` and `screens/` hold every state in both appearances.
- `PARITY-NOTES.md` holds the measurements and explains each remaining difference.

## What was implemented (Checkpoint 1 only)

**The locked Log Compact Command Center**, implemented in this order:

1. Header.
2. Amber Training Logger execution field.
3. Logged Today title and date, with the 2×2 semantic tile grid. Training lines are multi-line; Nutrition shows macro detail; Activity shows "so far"; Weight is the 4th tile.
4. Pending review band, including the possible-duplicate warning and multiple reviews.
5. Processing band.
6. Quick actions: "Log weight for another date" and "Add evidence".
7. "Add details without an asset".
8. Upload caption.
9. Typed Sources disclosure, collapsed by default and expanding in place.

It also covers the loading, error and empty states and the realistic mixed-source density.

**Behavior is preserved:**
- every destination, plus the Production and Sandbox Add evidence routing and pickers;
- the sandbox draft continuation;
- pull-to-refresh, day-change and foreground reloads, and bounded processing polling;
- reconciliation notification sync;
- the Log-tab redirect into an active workout. `RootTabView` is untouched and the source-pinned strings are intact.

**Accessibility:**
- every tap target is at least 44 pt;
- semantic state is never color-only (the duplicate warning carries an icon);
- Dynamic Type scales every text role;
- at accessibility sizes the grid becomes one column;
- Sources is a single VoiceOver group named "Evidence sources", with expanded/collapsed state.

**Tokens:** the work inherits the Batch 1 `redesign*` tokens and adds 5 Log tokens to `PhysiqueOSTheme`: muted, amber ink, cyan ink, on-amber and hairline. It creates no competing theme, adds no new project files, and changes no Batch 1 geometry.

## D1: typed Log Sources provenance (Server + Native)

**Server** (`c7c99347`; narrow, additive, backward compatible):
- `row.provenance` / `line.provenance` = `{ scope, sources: [{ kind, label }] }`. The kinds are `apple_health`, `physiqueos_logger` and `unavailable`.
- Training provenance lives on each line, so mixed sources stay truthful.
- Only provable sources are named:
  - a direct Apple Health record;
  - a session committed by the Workout Logger (`logger_origin`);
  - canonical HealthKit Cardio and OTHER lines.
- Everything else is reported as unavailable.
- A **confirmed** HealthKit Strength link adds Apple Health to the Strength line, using the same confirmation rule as the existing caption.
- `row.contextDetail` is the legacy caption without "Apple Health". A processing row mirrors its status line in `contextDetail`.
- The legacy `context`, `summary`, `lines` text, hrefs and record ids are byte-identical, so shipping Builds ≤ 87 are unaffected.
- **Tests:**
  - 9 new deterministic provenance tests: mixed sources, a combined Strength line, unprovable sources, empty rows, the processing overlay, kind vocabulary and idempotent Apple Health addition.
  - A confirmed/candidate overlay test.
  - The full Server unit suite shows the **same 302 failures at production `27dad44a` and at the candidate, with zero new failures**. The failure sets were diffed by name.

**Native** (in `b540b323`):
- Decodes typed provenance and `contextDetail`, lossily: a malformed provenance never fails the Log read.
- Builds Sources only from typed fields.
- An older Server (no typed keys) keeps the legacy caption on tiles and shows no Sources disclosure, so the Native build is safe in either deploy order.
- The Weight tile is attributed as "Source unavailable", because the `weight.current` read carries no provenance.

## Pixel-parity loop

The full measurement table is in `PARITY-NOTES.md`. In summary:

- **Geometry:** field, icon tile, every tile, band, quick actions and the Sources box match within ≤ 0.7 pt, which is pixel-grid rounding.
- **Colors:** every semantic fill and rule matches exactly in Dark and in Mineral Light.

Corrections made during the loop:
- **Tile labels:** the tile's 2 pt rule now sits inside the box, as CSS draws a border.
- **Review band:** collapsed the CSS margins between the band's paragraph and action line (4 + 6 became 6), which shortened the band by 4.6 pt.
- **Tight line-heights:** title and label roles now use CSS-exact line boxes.
- **Sources box:** the box now includes its 1 pt border (CSS border-box).
- **Glyphs:** corrected the size and position of the diamond, plus, upload, Sources and chevron glyphs.
- **Arrow:** used the design's literal "→".

Remaining differences, each explained in the notes:
- iOS status bar and safe area;
- the accepted Liquid Glass tab bar;
- glyph baseline placement of ≤ 1.5 pt (CoreText versus Chromium, with the identical font file);
- iOS orphan prevention re-wrapping two strings (see the decision below);
- SF Symbols replacing the harness's text-glyph stand-ins;
- rasterization differences.

## Tests

- **Native unit tests** (dedicated simulator), all passing with 0 failures:
  - `LogReadModelTests`, which add 4 Sources tests;
  - `FounderServerAPITests`, which add 3: typed decode, legacy fallback and malformed provenance;
  - `AppTabTests`, `PhotoProcessingUXTests`, `SharedUITests`, `HomeWidgetTests` and `LoggingSandboxTests`.
- **UI tests:**
  - `testDatePickerTodayIsReachableWithoutSavingEvidence` passed.
  - `testFounderCorrectionHomeConfidenceAndLoggerShoulders` passed.
  - `testWorkoutCompleteSurvivesATabSwitchUntilReturnToLog` passed on a fresh install. In a combined run it failed only because the preceding test leaves a live workout, so the canonical Log-tab redirect opens the Logger. That is pre-existing test-order coupling, not a regression.
  - `FoamRollingPriorityDetailUITests` passed 7/7, including the new full-row test.
- **Release generic iOS compile:** BUILD SUCCEEDED, covering the app, the Watch app and the Live Activity appex.
- **Not touched:** no Logger, Watch, HealthKit, Live Activity, authority or finish code changed.

## Addendum: You/Settings full-row tap targets (`bb6a6584`)

- **Root cause:** `YouNavigationRow` is a plain-style `Button` whose paper background sits outside its label, so only drawn glyphs were hit-testable.
- **Fix:** a full-row `contentShape` on the label. The audit found the same row type on Goals, Operating Plan, Settings, Founder device connection and Settings → Appearance. The Appearance option cards now also declare their card shape.
- **Proof of defect and fix:** a new UI test taps at the leading content, the center whitespace and the trailing chevron edge of all 5 rows, alternating Dark and Mineral. It **failed before the fix** (Settings → Appearance at the center) and passes after.
- **Pixel safety:** You, Settings and Appearance captured before and after are **pixel-identical in row content** in both appearances. The only differing pixels are 32 inside the system Liquid Glass tab bar's You glyph, in one Dark capture versus the first-launch baseline. No row was touched there.
- The fix rides with the eventual Batch 2 candidate. No standalone build was made.

## Decisions / authorization needed

1. **Founder visual review of Checkpoint 1.** Accept it or list corrections. Checkpoint 2 starts only after explicit approval.
2. **Server D1 deploy authorization.** Deploying Server `c7c99347` (on top of production `27dad44a`) to production requires the Founder's explicit chat authorization under the current workflow. I stopped at this point and did not deploy. Until it is deployed, production Log shows the legacy caption on tiles and no Sources disclosure, and Native handles that safely.
3. **Optional:** match Chromium's greedy line wrap for the two orphan-prevented strings using UIKit-backed text, or accept iOS typesetting. **Recommendation: accept.**

## Ledger

- **"Log — Sources disclosure needs structured per-row provenance":** implemented on branches; awaiting Server deploy and Founder acceptance.
- **New entry for the You/Settings full-row tap targets:** fixed on the Batch 2 branch.
- **Still open, untouched:** Watch Complete Set during Review/Confirmation, the timed-set Watch projection, Logger hidden error copy and the peptide fixture.

## Shipping isolation

- No production mutation, no deploy, no TestFlight.
- No Watch, HealthKit, workout-authority or Logger change.
- No change to the files Codex A is correcting in Home.

Stop reason: Checkpoint 1 is implemented, measured and published, and requires Founder visual approval (plus Server D1 deploy authorization) before Checkpoint 2.
