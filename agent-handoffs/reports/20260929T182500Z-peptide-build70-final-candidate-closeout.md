# Build 70 final candidate closeout — simplified peptide editor + canonical Pause/Resume + roll-forwards

Supersedes the status report `20260929T175500Z-peptide-build70-candidate-status.md` (same design; that report's Native SHA `0e3a0da8` is now `bf7ba1e7`, a test-only delta). Design/authority map: `20260929T083000Z-peptide-protocol-editor-pause-resume-design-map.md`.

**All Build 70 gates passed. Nothing is deployed. Nothing is uploaded to TestFlight. Production was never mutated.** Awaiting Founder/ChatGPT review.

## Exact SHAs (dustinginn/physiqueos)
| Layer | Branch | SHA |
|---|---|---|
| **Server candidate** | `claude/next-build-server-candidate-20260929` | **`b94ab533c19821a1f4276e4167c5dc080b86f4d0`** |
| **Native Build 70** | `claude/peptide-ux-native-20260929` | **`bf7ba1e73e41869084ee24bd979c329ecbed42b3`** |
| Production baseline | deployed | Server `98534bf8`, Native Build 69 `efa65db1` |
Server candidate = production + peptide Pause/Resume/read contract `cc440e16` + weekly averages `31235b35` + Logged Today provenance `438cba08` + Foam Rolling skip `c7118c6a`. Native includes weight rows `7e843d74`. Build number 70 (`APP_BUILD_NUMBER`, CFBundleVersion test literal); generated pbxproj is deterministic (regeneration leaves the tree clean).

## Gate results (exact SHAs above)
| Gate | Result |
|---|---|
| Server full regression (unit config) at `b94ab533` | 9315/9623 pass; 303 failures identical to the production baseline (9178/9486, 303); **0 new** |
| Server production build at `b94ab533` (`npm run build -- --webpack`, Next 16.2.9) | **succeeded (exit 0)** |
| Native full unit suite at `bf7ba1e7` (`-only-testing:PhysiqueOSTests`, iPhone 17 Pro / iOS 26.5 simulator) | **1564 tests, 0 failures** |
| Native Release compile at `bf7ba1e7` (`-configuration Release -destination generic/platform=iOS`) | **BUILD SUCCEEDED**; 3 pre-existing Swift 6 actor-isolation warnings in untouched `BackgroundExecutionAssertion.swift` |
| Adversarial review | Server: multiple lenses (findings fixed). Native: 3 lenses (UX, correctness, Build 69 preservation) at `9f71eeed`, no blockers, majors fixed in `0e3a0da8` |
History: the first full Native run at `0e3a0da8` had 7 failures, all stale test expectations (source-scan strings for copy that the review fixes intentionally changed, plus one generic-copy assertion); production code unchanged; tests updated in `bf7ba1e7` and the full suite re-run clean. No production Swift/JS changed between `0e3a0da8` and `bf7ba1e7`.

## Risk-scaled validation (what was and was not run)
- Run: full Native unit suite, Release compile, full Server regression vs baseline, exact-SHA Server production build. These cover the changed surfaces (peptide view model/sheets/API, lifecycle command, paused Priority Detail, notification withdrawal/orphan sweep, weight rows, Server projection/guards).
- **Not run, deliberately:** the simulator UI test bundle and any simulator tour. The existing UI tests are sandbox-pinned Goals/Training flows and no file they exercise changed; the changed flows need the deployed Server (`lifecycle`, `executionRevision`, `doseAdjustable`, `localDate`) to be meaningful, so simulator evidence would only exercise the sandbox fixture path already covered by view-model tests.
- **Honest gap:** no rendered/visual check of the new peptide screen (Dynamic Type, sheet layout) has been produced. That, plus real-Server integration and real notification withdrawal, is what Founder acceptance below is for.

## Deploy order (NOT authorized; needs Founder go-ahead)
1. **Server `b94ab533` first.** Additive read keys + the new `operating-plan.peptide-lifecycle.change.v1` command; Build 69 keeps working (legacy editor path, no Pause). Standard guarded deploy; production Founder data is not migrated (state is created only when Pause is used).
2. **Then Native Build 70** (archive/upload only after the Founder accepts); it feature-detects `lifecycle` + `executionRevision` and falls back to the Build 69 editor against an older Server.
Rollback caveats: rolling the Server back silently un-pauses any paused peptide (98534bf8 ignores `scheduleSuspensions`); a record edited with the new composition can read as Custom on 98534bf8; Build 69 Advanced past-phase edits are refused with `PEPTIDE_PLAN_REWRITES_HISTORY` on the new Server; a paused peptide has no in-app Resume on Build 69.

## Founder acceptance scope (changed workflows only; after Server deploy + Build 70 install)
1. Peptides → Retatrutide: card rows (Dose, Days, Time, Next dose, Reminder, Notes); Advanced collapsed with "Increase, hold, then decrease · finished Aug 6"; no generator wording. Tesamorelin shows "Sun–Thu".
2. Change dose (3 taps): caption reads a steady dose from the date; Dose history unchanged; Days/Time/Notes each one sheet; Reminder switch saves inline.
3. Pause today: Home + reminders stop, delivered banner disappears, Priority Detail reads Paused with no Mark Complete. Pause tomorrow: chip "Pauses <date>", tonight still offered, "Cancel pause" works. Resume: next dose shown; any planned titration change moved by the pause length.
4. Peptide dose Priority Detail: "Took a different amount?" only on peptides; untouched Mark Complete records the planned dose.
5. Logged Today shows the Apple Health caption on the whole Training group; Foam Rolling offers Mark Skipped.
6. Weight Evidence Weekly Averages cover the full selected Goal range (e.g. 11 weeks back to Jul 19), matching the trend graph.
Everything else (Workout Complete PR celebration, Morning Check-In, briefings, auth/Face ID lane) is unchanged and not part of this acceptance.

## Disk handling (Founder instruction: stay ≥15 GiB floor, free only disposable artifacts)
Free space was 14.0 GiB; nothing was run below the floor. Reclaimed ~3.8 GiB, only regenerable build output: git-ignored Next `.next` build dirs (3 dirs, ~2.1 GiB) and `node_modules` of two old clean, pushed worktrees (~1.5 GiB, reinstallable from their lockfiles), my own stale regression JSON, and the test simulator's data via `simctl erase` after each run. No source, uncommitted work (`native-production-read-foundation` has uncommitted edits; only its ignored `.next` was removed), credentials, Founder evidence, archives, or simulator runtimes were touched. Free space now ~16.9 GiB.

## Decisions still open (non-blocking)
Briefings: say "paused" for a paused peptide? Mark Skipped for supplement reminders? Both deferred.
