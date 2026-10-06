# Build 89 · TestFlight release (Claude)

**Task id:** `build89-testflight-release-20261006` (prompt `agent-handoffs/inbox/prompts/20261006T183000Z-claude-build89-release-testflight.md` at f41dc5a6)

**Status:** **Build 89 VALID in TestFlight and ready for Founder physical acceptance.** STOPPED.

## Authority

| Item | Value |
|---|---|
| **Shipped source SHA** | `51399425b683d6a6e36b5c91836290259e31a7e0` |
| Branch | `claude/native-build89-integrated-source-candidate-20261006` (pushed) |
| Pre-bump source | `4d4ca18711d3065536cc71d0555118fd969dd409` (Founder-authorized integrated candidate) |
| Previous release | Build 88 `7fce3b9708c063f3c6b58571778c595012b5de6d` |
| Integrated pins | Claude A `f3579d87`, Claude B `156808fa`, Codex `5b79118f` |
| App | `com.physiqueos.native.dev` **1.0 (89)** |
| Watch app | `com.physiqueos.native.dev.watchkitapp` 1.0 (89) |
| Live Activity / Widget extension | `com.physiqueos.native.dev.WorkoutActivity` 1.0 (89) |
| Archive | `~/Library/Developer/Xcode/Archives/2026-10-06/PhysiqueOS-Build89-51399425.xcarchive` |
| Delivery ID | `cc70050d-b573-4cb8-98d0-e163b76b205a` |
| App Store Connect | **VALID**: build-status VALID, import-status VALID, on App Store Connect; uploaded 2026-10-06 18:32:42Z; VALID confirmed 18:45:37Z |
| Production Server | Unchanged: `b7eb1e39` / deployment `6fa4e887`, ACTIVE; `/api/v1/health/live` 200 (verified read-only) |

Integration report: `agent-handoffs/reports/20261006T180114Z-build89-integrated-source-candidate.md`.

## Pre-flight authority check

All checks passed before any metadata changed:
- **HEAD:** equal to `origin` and to `4d4ca187`, with a clean tree.
- **No newer product source:** HEAD was exactly the authorized candidate.
- **Progression lane excluded:** the post-Build-89 Training progression correction lane was NOT incorporated. That Server work stays isolated, and the release delta contains no Server files.
- **latest.json / latest.md:** still Build 88 before the release.
- **Disk:** 21 GiB free.
- **Release tooling:** ASC `auth-check` OK; last uploaded build 88.

## Metadata-only delta (`4d4ca187` → `51399425`)

The delta is 3 files, +10 / −10, with no product behavior change:
- `ios/Scripts/generate_project.py`: `APP_BUILD_NUMBER = 89`.
- `ios/PhysiqueOS.xcodeproj/project.pbxproj`: the 8 generated `CURRENT_PROJECT_VERSION = 89` lines (app, extension, Watch app, Watch tests; Debug + Release).
- `ios/PhysiqueOSTests/TrainingLoggerTests.swift`: the CFBundleVersion pin, set to `"89"`.

Marketing version stays **1.0** (14 `MARKETING_VERSION = 1.0` entries). No 88 build pin remains.

## Post-bump release gates (on `51399425` content)

| Gate | Result |
|---|---|
| `verify_release_configuration.py` | verified: 1.0 (89), AppIcon, HealthKit, App Group, Live Activity + Home widget extension |
| Build/version parity (built products) | app, Watch and extension all 1.0 (89) |
| Generator determinism | regenerated project identical |
| `git diff --check` | clean |
| Fast release-contract unit gate | **142 / 0**: TrainingLoggerTests (CFBundleVersion 89 pin), WorkoutLiveActivityContractTests (extension embedded + shares build), AppTabTests (DEBUG review routes stay out of Release), HomeWidgetTests |
| Generic Release compile (`generic/platform=iOS`) | BUILD SUCCEEDED (app + Watch + extension) |
| Release seam scan | 0 in app, Watch and extension binaries |

I did not rerun the full 2,132-test suite. The bump is metadata-only, and exact pre-bump `4d4ca187` already passed the complete integration gates: unit 2132/0, iPhone UI 73/0, Watch unit 57/0, Watch UI 6/7 (the Build 88-identical WCSession harness limitation).

## Archive verification

`xcodebuild archive -allowProvisioningUpdates` ran from the exact clean pushed SHA. It left the worktree clean, with no Xcode re-serialization.

- **Identity:** Info.plist `com.physiqueos.native.dev` 1.0 (89), team 33GMTRM6G9, ArchiveVersion 2.
- **Embedded targets:** the Watch app (arm64 + arm64_32) and the Live Activity / Widget extension (arm64). Both are 1.0 (89).
- **App binary:** arm64.
- **Signing:**
  - The archive is signed with Apple Development (team 33GMTRM6G9), the established flow. Distribution signing happens at the guarded export.
  - `codesign --verify --deep --strict` passes.
- **dSYMs:** app, Watch and extension present. The app dSYM UUID matches the binary.
- **Info.plist keys:**
  - present: Health usage strings, `NSSupportsLiveActivities`, `ITSAppUsesNonExemptEncryption = false`;
  - Watch: `WKBackgroundModes = [workout-processing]`, with no `UIBackgroundModes`;
  - Plus Jakarta Sans is bundled in the Watch app.
- **Seams:** 0 DEBUG/review seams in all three binaries.
- **Build 88 archive:** untouched.

## TestFlight

I used the guarded tool `physiqueos-asc-upload` (API key):
1. **Dry run:** all PASS, "WOULD UPLOAD com.physiqueos.native.dev 1.0 (89)".
2. **Upload:** `--execute --confirm "UPLOAD com.physiqueos.native.dev 1.0 (89)"`; EXPORT SUCCEEDED, "Upload succeeded".
3. **Delivery ID:** `cc70050d-b573-4cb8-98d0-e163b76b205a`. The release state is now last uploaded = 89, so the next build is 90.
4. **Processing:** the tool's 10-minute wait ended with the state not yet indexed (`status` query failed while Apple registered the delivery). Re-polling through the guarded `status` command returned **VALID** at 18:45:37Z (build VALID, import VALID, on App Store Connect).

## Release authority

After VALID, `latest.json` / `latest.md` were updated to the Build 89 shipped authority in this same report commit, following the Build 88 process. The publisher's dry-run gate passed, and the commit was made via git plumbing because of the single-RC-worktree rule.

## Physical-device acceptance checklist (Build 89)

1. **Watch:**
   - Dark + Mineral Light;
   - Mineral compact clock capsule;
   - independent iPhone and Watch appearance;
   - timed sets;
   - Complete Set gating;
   - workout responsiveness;
   - superset behavior when next available;
   - Watch finish → phone recap and PR parity.
2. **Live Activity:**
   - before the first set / no rest: WORKOUT + stopwatch;
   - after a set: green REST · STOPWATCH;
   - Dynamic Island sanity.
3. **Daily Capture / Priorities:**
   - Morning Check-In;
   - manual / backdated weight;
   - Home Confidence;
   - Priority Detail variants.
4. **Briefings:**
   - open the most recent real Midweek, Weekly, Monthly, Photo and DEXA;
   - History;
   - Sun–Tue Midweek;
   - real Photo media;
   - DEXA rails, colors and the WHAT THIS SCAN MEANS lead.
5. **Build 89 small fixes:**
   - Training Detail PR card;
   - Nutrition Calories green;
   - Home exact timeline copy;
   - Widget refresh teal;
   - Suggested Today explicit selector;
   - Logger Option B 16 pt Semibold REPS/LOAD.
6. **General smoke:** Home, Goals, Log, Evidence, You, Sources/Settings.

## Known non-blocking items (not folded into this release)

- **Training progression authority correction:** the post-Build-89 Server lane. It stays isolated and was not deployed.
- **GitHub issue #7:** the iPhone Logger rest stopwatch for phone-only workouts.
- **Watch UI harness:** the pre-existing no-WCSession limitation (`testFinalSetFinish…`).
- **Watch performance:** the speculative reply-before-side-effects optimization.

## Explicit non-actions

- No Server deploy, no production data mutation.
- No Build 90 work.
- The progression Server candidate was not deployed.
- Only the build-number metadata changed from the authorized candidate.
