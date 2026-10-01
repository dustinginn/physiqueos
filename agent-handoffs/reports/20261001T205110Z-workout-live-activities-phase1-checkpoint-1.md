# Workout Live Activities Phase 1 — checkpoint 1 (pre-TestFlight: shipping screenshots + signing status)

- Task id: `workout-live-activities-phase1-implementation-20261001`
- Prompt: `agent-handoffs/inbox/prompts/20261001T201500Z-workout-live-activities-phase1-implementation.md`
- Generated (UTC): 2026-10-01T20:51:10Z
- Status: **candidate / paused awaiting fresh review + archive** (no upload yet)

## Exact base and candidate
- Base: `2b41dc48` (validated TrainingSessionAuthority on shipped Build 76). Last uploaded Native build: 76. Production Server untouched.
- Branch `claude/workout-live-activities-phase1-20261001`, pushed head `27f6dbf8` (this checkpoint describes that head).
- Performance-record celebration fix `69cad804` was NOT merged (kept isolated, as instructed).

## Implemented
- **Superset hardening first** (tests before UI, fresh review: no blockers; its hardening items fixed): a "unit" is an ordinary exercise or a whole superset. Final-set and Completed+Up Next key off the unit; round alternation A1→B1→A2→B2; a member running out of sets mid-round never shows Completed+Up Next; unequal sizes both ways, single-set members, last unit, entering and back-to-back supersets, out-of-order, no-timestamp fallback, malformed relationships. Projection carries `isFinalSetOfUnit` and `supersetLabel` (A/B).
- **Rest preference**: Stopwatch is the default; Countdown (9 preset lengths, default 1:30) and Off selectable from a compact Logger menu; persisted; applies from the next completed set (a running rest keeps its mode).
- **Shared ActivityKit contract** (compiled into app and extension; payload test < 3 KB; unknown enums fail safe; schema versioned): attributes + ContentState with max two rows, completion target identity, expectedRevision, rest mode/startedAt/endsAt, phases, deep-link builder/parser.
- **Widget Extension** `PhysiqueOSLiveActivity` via the generator (pinned ID block 0x1600+; additions-only diff except my own earlier test IDs moving into their pinned block): bundle id `com.physiqueos.native.dev.WorkoutActivity`, version = app build, embedded in the app, `SKIP_INSTALL`, extension-API-only, no entitlements, no App Group, no push. App Info.plist: `NSSupportsLiveActivities`, URL scheme `physiqueos-workout`. Release verifier is now extension-aware.
- **Coordinator** (local updates only): one activity per workout, adoption on relaunch, orphan/duplicate/other-authority/old-schema cleanup, user-swipe suppression (own endings never suppress), value-edit coalescing (1 s), Save & Leave ends / Resume restarts, Cancel ends immediately, durable commit shows "Workout saved" and dismisses after 15 min, finishing state, stale policy, disabled/not-foreground handling. ActivityKit state never feeds back into workout state.
- **Complete Set LiveActivityIntent** → bridge → `TrainingSessionAuthority.completeSet` with the rendered `expectedRevision` and a fresh `mutationId` per tap; every outcome fails safe (applied / unchanged / duplicate / stale / session ended / wrong phase / invalid values / persistence failure / unavailable). The intent returns only after the activity has re-rendered. No second mutation implementation.
- **Tap to open**: widgetURL deep link routed through the existing Log navigation (navigation only, session must exist locally).
- **UI**: Lock Screen, compact, minimal and expanded Dynamic Island following the approved prototype (large lower-left rest clock, trailing 44 pt Complete Set, max two rows, A/B superset chips, privacy-redacted body that also removes Complete Set).

## Tests actually run (head `27f6dbf8` unless noted)
- Full Native unit suite (at the implementation commit before the last small intent fix): 1822 tests, 1 failure = the known Peptide dose test (pre-existing, unrelated).
- New: contract/mapper/deep-link (17), coordinator (21), intent/bridge (≈15), views/screenshots (6), rest preference (8), superset projection (+), authority suites. After the last commit, intent + coordinator suites re-run: 36 tests, 0 failures.
- UI journeys on a clean private simulator: Save & Leave/reopen, Workout Review confirmation, new rest-menu journey (Stopwatch default, Off, Countdown), and a backgrounded-workout journey all pass. Real ActivityKit `request` and `update` succeeded in the simulator (os_log).
- Generator regenerates the committed project byte-for-byte; `verify_release_configuration.py` passes (extension-aware).

## Screenshots (shipping SwiftUI source, approved-prototype letters)
`docs/workout-live-activity-phase1/screenshots/` (22 PNG): A–F Lock Screen, G–I and K expanded island, J1–J3 compact/minimal, plus all-sets-complete, saving, saved, long names, privacy-redacted, stale, countdown-complete and accessibility Dynamic Type. Visual comparison against the prototype `revision-1` set: layout, two-row rule, rest hierarchy, trailing Complete Set, chips and colors match.
- **Limit:** these are the real shared views hosted in the app test runner with a test-only Lock Screen/Island backdrop. The simulator does not render Live Activity UI in headless screenshots, so system-rendered Lock Screen / Dynamic Island appearance and locked-device button behavior are NOT verified; they are physical-device items.

## Signing status
- Xcode automatic signing already works for the extension on a Debug device build (Apple Development identity; no re-authentication or 2FA needed). App Store Connect API-key auth check passes (read-only). Distribution signing/export of the new extension App ID is not yet exercised: that happens at archive/upload. If Xcode asks for Apple ID re-authentication, the Founder action will be reported exactly.

## Not yet done
- Fresh independent full-implementation review (running), Release compile, archive + release-tool dry run, build bump to 77, TestFlight upload, VALID wait, physical-device acceptance (cannot be done by the agent).

## Founder acceptance checklist
Will be published in full with the final report.
