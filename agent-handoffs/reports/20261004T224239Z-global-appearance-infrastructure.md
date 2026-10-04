# Global System / Dark / Mineral Light appearance infrastructure

Status: IMPLEMENTED ON ISOLATED BRANCH; RELEASE-COMPILED; READY FOR INTEGRATION AND FOUNDER PHYSICAL VALIDATION

Agent: Codex A  
Generated: 2026-10-04T22:42:39Z  
Prompt authority: `af844a6ae61ffd3a3b897dbd297856e2ebaeb6ff`  
Implementation branch: `codex/global-appearance-infrastructure-20261004`  
Implementation head: `d5359e33845cba20a212dade24c25e94f02aee6e`  
Implementation commits: `3ceb9a803ffdde99a87e720b22f8c2b642644823`, `d5359e33845cba20a212dade24c25e94f02aee6e`

## Outcome

PhysiqueOS now has one typed device-local appearance owner with exactly System, Dark and Light. System is the no-value/default state and applies no root scheme override. Dark explicitly uses the locked dark appearance. Light explicitly uses the locked Mineral Light palette. Changes apply immediately and explicit choices persist in `UserDefaults`; the preference never enters Server, Evidence or account state.

The only new product route is the narrow, real `You → Settings → Appearance` path. Profile, Data Sources and Sign Out were not implemented and no dead destinations were added.

This is infrastructure, not a broad redesign implementation. Existing screens keep current production information, behavior and geometry while shared semantic colors become appearance-aware.

## Implementation

- Added `AppAppearance` and an app-level observable `AppAppearanceStore` with injectable persistence and deterministic reset.
- Removed the forced-dark iPhone root. The root now uses `nil`, `.dark` or `.light` according to the typed selection.
- Converted shared product tokens into dynamic locked dark/Mineral pairs: canvas, elevated/trajectory/muted/accent surfaces, text hierarchy, divider, accent, status and domain/chart families.
- Kept domain colors semantic rather than mechanically inverted.
- Added selected text/checkmark/accessibility values to Appearance rows, so state is not color-only.
- Added DEBUG-only deterministic review routing; it is absent from Release.
- Added a WidgetKit-owned paired palette. The widget follows its own `colorScheme`, not the iPhone app preference.
- Preserved Live Activity platform semantics and the Watch-owned appearance contract.
- Removed the last unintended fixed-dark override from the iPhone Recovery nights sheet.

## Appearance ownership

Canonical matrix: [`agent-handoffs/artifacts/20261004-global-appearance/appearance-ownership-matrix.md`](../artifacts/20261004-global-appearance/appearance-ownership-matrix.md)

Summary:

- iOS-owned controls, alerts, keyboards and presentation chrome inherit the effective root scheme.
- Main app product surfaces resolve through shared dynamic PhysiqueOS tokens.
- Widget, Live Activity, photo inspection, accepted Foam Rolling pilot and Watch retain intentional component/platform ownership.
- Locked redesign composition and geometry remain deferred; theme infrastructure does not falsely claim those layouts are implemented.

## Real simulator review artifacts

- Mobile comparison page: [`agent-handoffs/artifacts/20261004-global-appearance/comparison-board.html`](../artifacts/20261004-global-appearance/comparison-board.html)
- Full-resolution screenshot root: [`agent-handoffs/artifacts/20261004-global-appearance/screenshots/`](../artifacts/20261004-global-appearance/screenshots/)
- 22 full-resolution iPhone 17 Pro PNGs: System-resolved Home in both OS modes plus explicit Dark/Mineral pairs for Home, Log, Briefing, Evidence, Training Logger, Goals, Operating Plan, You, Appearance and manual/backdated Weight.

The Home Screen Widget cannot be placed deterministically by the current simulator UI-test harness. Widget dark/light behavior is source-owned by WidgetKit `colorScheme`, compiled in the full extension graph and retained on the physical-device checklist.

## Validation

| Gate | Result |
| --- | --- |
| Fresh/no preference → System with no stored value | PASS — focused unit |
| Explicit Dark/Light persistence and System clearing override | PASS — focused unit |
| Invalid legacy value → System | PASS — focused unit |
| Deterministic reset seam | PASS — focused unit |
| Core dark/Mineral contrast | PASS — primary ≥ 7:1 and secondary ≥ 4.5:1 against tested canvas/surface |
| Shared UI focused suite | PASS — 28 tests, 0 failures |
| Appearance control UI | PASS — 1 test, 0 failures |
| Foam Rolling + Appearance UI class | PASS — 3 tests, 0 failures |
| Representative explicit Dark/Mineral surface captures | PASS — 2 UI tests, 20 captures |
| System resolved Dark | PASS — simulator forced dark, app selection System, 1/1 UI test |
| System resolved Light | PASS — simulator forced light, app selection System, 1/1 UI test |
| Release compile | PASS — `PhysiqueOS` Release generic iOS, including Watch and Live Activity dependency graph; widget sources compile in the app project |

Full Native unit suite result: 1,998 executed, one skipped live-capture test, one failure. The isolated failure is `PeptideSupportEditorViewModelTests.testSandboxChangeDoseKeepsHistoryAndPauseResumeWorkAgainstTheFixture` at line 616 (`nextDoseLabel` expected `Paused`, observed `nil`). No appearance commit touches the peptide editor/store/test. It reproduced on isolated rerun and is recorded as an unrelated existing fixture expectation; it was not expanded into this task.

Release compile warnings are existing concurrency warnings in `PhysiqueOSApp.swift` / `BackgroundExecutionAssertion.swift`; there are no compile errors.

## Claude Watch/HealthKit coordination

Claude's published implementation authority is clean at:

- branch `claude/native-watch-healthkit-build86-20261004`
- commit `d43ad7cd2cb18e230b44d2654a999e5f304fc586`
- parent lane includes `a5646c8b` and Foam Rolling pilot `b65deb00`

The appearance branch deliberately starts at the shared Foam Rolling pilot `b65deb00`. Claude's final commit changes 13 Watch/HealthKit contract, networking, Watch UI/store and Watch test files plus the generator inherited from `a5646c8b`. Appearance changes 12 different app/theme/routing/widget/test files after the final correction. There are no overlapping changed files between `b65deb00..d43ad7cd` and `b65deb00..d5359e33`.

Integration order:

1. Use Claude `d43ad7cd` as the next-build candidate authority.
2. Cherry-pick appearance commits `3ceb9a80`, then `d5359e33`.
3. Regenerate/project-file work stays last if another lane changes the generator.
4. Re-run the focused appearance/Watch suites and Release build on the combined head.

A three-way `git merge-tree` simulation over the shared `b65deb00` base reported no conflicts. The appearance lane does not alter Claude's Watch/HealthKit files, workout state machine, connectivity, HealthKit write path or Foam Rolling behavior. The iPhone preference is not transported to Watch.

## Delta ledger

Only “Appearance — System, Dark and locked Mineral Light” is advanced to implemented/release-gated. Profile, Data Sources, Sign Out and all unrelated redesign implementation entries remain open.

## Physical-device acceptance checklist

- Fresh install with no key follows iPhone Dark/Light and changes live while System is selected.
- Select Dark, relaunch and change iPhone appearance; PhysiqueOS remains dark.
- Select Light, relaunch and change iPhone appearance; PhysiqueOS remains Mineral Light.
- Return to System; confirm the preference key is cleared and OS following resumes.
- Verify the visible checkmark plus VoiceOver “Selected” state for all three options.
- Inspect keyboard, date picker, alerts, sheets and manual/backdated Weight in both appearances.
- Add small and large Home widgets; verify both system appearances, privacy redaction, stale/offline and active-workout states.
- Verify Live Activity on Lock Screen and Dynamic Island in both platform appearances.
- Verify Watch workout start/finish/Health state on Claude's combined candidate; confirm Watch remains independent of the iPhone selection.
- Reboot/relaunch once to confirm persistence and protected-data recovery behavior.

## Safety / stop state

- No Server code, schema or production state changed.
- No canonical content or behavior changed.
- No broad locked-screen redesign was implemented.
- No TestFlight build was created or uploaded.
- Work stops at the requested implementation/review gate.

